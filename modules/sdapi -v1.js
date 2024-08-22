const { StableDiffusionApi } = require("a1111-webui-api");
const { ObjectId } = require('mongodb');
const fs = require('fs');
const ngrok = require('ngrok');
const {startNgrok,stopNgrok} = require('../services/startNgrok');

// NOVITA
  
    // Function to trigger the Novita API for text-to-image generation
    async function fetchNovitaMagic(data) {
      try {
        const image_request = {
          model_name: data.checkpoint || "sudachi_v10_62914.safetensors",
          prompt: data.prompt,
          negative_prompt: "(worst quality, low quality:1.4), boring_e621, bad anatomy, (human, smooth skin:1.3), (mutated body:1.3), blurry, text, error, missing fingers, , extra digit, fewer digits, cropped, jpeg artifacts, signature, watermark, username, blurry, pregnant,",          
          width: data.width,          
          height: data.height,
          image_num: 1,
          steps: 30,
          seed: -1,
          clip_skip: 1,
          guidance_scale: 7.5,
          sampler_name: "DPM++ 2S a Karras",
        }
        console.log(image_request)
        const response = await axios.post('https://api.novita.ai/v3/async/txt2img', {
          extra: {
            response_image_type: 'jpeg',
            enable_nsfw_detection: false,
            nsfw_detection_level: 0,
          },
          request: image_request,
        }, {
          headers: {
            Authorization: `Bearer ${process.env.NOVITA_API_KEY}`,
            'Content-Type': 'application/json',
          },
        });
  
        if (response.status !== 200) {
          throw new Error(`Error: ${response.status} - ${response.data}`);
        }
  
        return response.data.task_id;
      } catch (error) {
        console.error('Error fetching Novita image:', error.message);
        throw error;
      }
    }
  
  // Function to retrieve the result from Novita API using task_id with polling and upload it to S3
  async function fetchNovitaResult(task_id) {
    const pollInterval = 1000; // Poll every 1 second
    const maxAttempts = 120; // Set a maximum number of attempts to avoid infinite loops

    let attempts = 0;

    return new Promise((resolve, reject) => {
        const timer = setInterval(async () => {
            attempts++;

            try {
                const response = await axios.get(`https://api.novita.ai/v3/async/task-result?task_id=${task_id}`, {
                    headers: {
                        Authorization: `Bearer ${process.env.NOVITA_API_KEY}`,
                    },
                });

                if (response.status !== 200) {
                    throw new Error(`Error fetching result: ${response.status} - ${response.data}`);
                }

                const taskStatus = response.data.task.status;

                if (taskStatus === 'TASK_STATUS_SUCCEED') {
                    clearInterval(timer);
                    const images = response.data.images;
                    if (images.length === 0) {
                        throw new Error('No images returned from Novita API');
                    }

                    // Download the image from Novita
                    const imageUrl = images[0].image_url;
                    const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
                    const buffer = Buffer.from(imageResponse.data, 'binary');

                    // Generate a hash from the buffer
                    const hash = createHash('md5').update(buffer).digest('hex');

                    // Upload the image to S3
                    const s3Url = await uploadToS3(buffer, hash, 'novita_result_image.png');
                    
                    // Resolve the promise with the S3 URL
                    resolve(s3Url);

                } else if (taskStatus === 'TASK_STATUS_FAILED') {
                    clearInterval(timer);
                    reject(`Task failed with reason: ${response.data.task.reason}`);
                } else if (attempts >= maxAttempts) {
                    clearInterval(timer);
                    reject('Task timed out.');
                }

                // Optionally, you can log the progress or queue status
                if (taskStatus === 'TASK_STATUS_QUEUED') {
                    console.log("Queueing...");
                } else if (taskStatus === 'TASK_STATUS_RUNNING') {
                    console.log(`Progress: ${response.data.task.progress_percent}%`);
                }

            } catch (error) {
                clearInterval(timer);
                console.error('Error fetching Novita result:', error.message);
                reject(error);
            }
        }, pollInterval);
    });
  }

  fastify.post('/novita/txt2img', async (request, reply) => {
    const { prompt, aspectRatio, userId, chatId, userChatId, character } = request.body;
    try {
      const apiKey = process.env.NOVITA_API_KEY;
      let closestCheckpoint = null
      const query = character ? character.checkpoint : null;
      if(query){
        const novitaApiUrl = `https://api.novita.ai/v3/model?pagination.limit=60&pagination.cursor=c_0&filter.source=civitai&filter.query=${encodeURIComponent(query)}&filter.types=checkpoint&filter.is_nsfw=false&filter.is_inpainting=0`;
        const response = await axios.get(novitaApiUrl, {
          headers: {
            'Authorization': `Bearer ${apiKey}`
          }
        });
        const data = response.data;
        
        if (data.models && data.models.length > 0) {
          const normalizedQuery = query.toLowerCase().replace(/[^a-z0-9]/g, '');
          const modelNames = data.models.map(model => model.sd_name.toLowerCase().replace(/[^a-z0-9]/g, ''));
          let bestMatch = stringSimilarity.findBestMatch(normalizedQuery, modelNames);
          const similarityThreshold = 0.5;
          if (bestMatch.bestMatch.rating >= similarityThreshold) {
            console.log({closestCheckpoint})
            closestCheckpoint = data.models[bestMatch.bestMatchIndex].sd_name;
          }
        }
      }
      const taskId = await fetchNovitaMagic({
        prompt,
        negativePrompt: character ? character.negativePrompt : null,
        sampler: character ? character.sampler : null,
        checkpoint: closestCheckpoint,
        width: 512,
        height: 712,
      });
  
      // Polling or wait for the task to complete (you might want to add a delay or retry logic here)
      const imageUrl = await fetchNovitaResult(taskId);
  
      const { imageId } = await saveImageToDB(userId, chatId, userChatId, prompt, imageUrl, aspectRatio);
  
      reply.send({ image_id: imageId, image: imageUrl });
    } catch (err) {
      console.error(err);
      reply.status(500).send('Error generating image');
    }
  });

async function getApiConfiguration() {
  let host = 'localhost';
  let port = 42421;

  if (process.env.NODE_ENV !== 'local') {
    // Start NGROK and get a public URL
    const url = await startNgrok(port);
    if (!url) {
      throw new Error('Failed to start NGROK. Check logs for more details.');
    }
    const urlObj = new URL(url);
    host = urlObj.hostname;
    port = urlObj.port || ''; // NGROK might provide a different port
    console.log(`NGROK running at ${url}`);
  }

  // Assuming StableDiffusionApi is imported or defined elsewhere
  return new StableDiffusionApi({
    host: host,
    port: port, 
    protocol: "http",
    defaultSampler: "DPM++ SDE",
    sampler_name: "DPM++ SDE",
    defaultStepCount: 40,
    cfg_scale: 7,
    safety_checker: true,
  });
}
  
const default_prompt = "High-quality photorealistic, showcasing a vibrant,detailed , colorful,clear,enhancing the colors and shadows for a cinematic feel./n"
const default_negative_prompt = 'face,man,woman,character,realistic face, body, (low quality, worst quality, bad quality, lowres:1.2), bad photo, bad art,oversaturated, watermark, username, signature, text, error, cropped, jpeg artifacts, autograph, trademark, (canvas frame, canvas border, out of frame:1.2),bad anatomy, bad hands, missing fingers, extra digit, fewer digits, bad feet, extra fingers, mutated hands, poorly drawn hands, bad proportions, extra limbs, disfigured, bad anatomy, gross proportions, malformed limbs, missing arms, missing legs, extra arms, extra legs, mutated hands, fused fingers, too many fingers, long neck,nsfw,naked,nipple'

async function txt2img(options){
  const sdapi = await getApiConfiguration();

  const prompt = options.prompt ? default_prompt + options.prompt : default_prompt;
  const negative_prompt = (options.negativePrompt && options.negativePrompt != '')? options.negativePrompt : default_negative_prompt;
  const aspectRatio = options.aspectRatio;

  const height = options.height ? options.height :768
  // Calculate the width based on the aspect ratio and the fixed height of 768
  const width = getWidthForAspectRatio(height, aspectRatio);

  const payload = {
    prompt,
    negative_prompt,
    width, // Use the calculated width
    height // Fixed height as provided
  };

  try {
    const result = await sdapi.txt2img(payload);
    const imageID = await saveImageToDB(db, options.blogId, prompt, result.image, aspectRatio);

    //await ensureFolderExists('./public/output');
    //const imagePath = `./public/output/${imageID}.png`;
    //await result.image.toFile(imagePath);
    //const base64Image = await convertImageToBase64(imagePath);

    //const imagePath = await uploadFileToS3(result.image, `${imageID}.png`)

    // Assume 'result.image' is a Sharp object
    const imageBuffer = await result.image.toBuffer();

    if (process.env.NODE_ENV !== 'local') {
      //stopNgrok();
    }
    return{ imageID, imageBuffer };
  } catch (err) {
    console.log(err)
    if (process.env.NODE_ENV !== 'local') {
      //stopNgrok();
    }
    return
  }
}

module.exports = {txt2img}


function getWidthForAspectRatio(height, ratio) {
  const [widthRatio, heightRatio] = ratio.split(':').map(Number);
  return Math.round((height * widthRatio) / heightRatio);
}

async function convertImageToBase64(imagePath) {
  const imageBuffer = await fs.promises.readFile(imagePath);
  const base64Image = imageBuffer.toString('base64');
  return base64Image;
}
async function saveImageToDB(db, blogId, prompt, image, aspectRatio) {
  const imageID = new ObjectId();
  const collection = db.collection('images');
  await collection.insertOne({
    _id: imageID,
    blogId,
    prompt,
    aspectRatio
  });
  
  return imageID;
}
async function ensureFolderExists(folderPath) {
  try {
    // Check if the folder exists
    await fs.promises.access(folderPath, fs.constants.F_OK);
  } catch (error) {
    // Folder does not exist, create it
    await fs.promises.mkdir(folderPath, { recursive: true });
  }
}