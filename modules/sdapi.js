const { ObjectId } = require('mongodb');
const axios = require('axios');



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
                    resolve(buffer)
                    // Generate a hash from the buffer
                    //const hash = createHash('md5').update(buffer).digest('hex');

                    // Upload the image to S3
                    //const s3Url = await uploadToS3(buffer, hash, 'novita_result_image.png');
                    
                    // Resolve the promise with the S3 URL
                    //resolve(s3Url);

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
  async function saveImageToDB(db, blogId, prompt) {
    const imageID = new ObjectId();
    const collection = db.collection('images');
    await collection.insertOne({
      _id: imageID,
      blogId,
      prompt,
    });
    
    return imageID;
  }
  async function txt2img(options){
    const { prompt, negativePrompt, aspectRatio, height, width, blogId } = options
    try {
      const apiKey = process.env.NOVITA_API_KEY;
      
      const taskId = await fetchNovitaMagic({
        prompt,
        negativePrompt,
        width: width || 712,
        height: height || 512,
      });
  
      const imageBuffer = await fetchNovitaResult(taskId);
      const imageID = await saveImageToDB(db, options.blogId, prompt);
      console.log('Image Fetch End')
      return { imageID , imageBuffer };
    } catch (err) {
      console.error(err);
      reply.status(500).send('Error generating image');
    }
  };

module.exports = {txt2img}

