const { getCategoryId, categoryExists, ensureCategory, getTermDetails, post } = require('./post.js')
const { getOrUpdateArticles } = require('./feedScraper.js');
const { generatePrompt } = require('../services/prompt.js')
const { moduleCompletion, moduleCompletionOllama } = require('./openai.js');
const { getSearchResult, getImageSearchResult } = require('../services/tools.js')
const { txt2img } = require('../modules/sdapi.js')
const { ObjectId } = require('mongodb');
const fetch = require('node-fetch');
const marked = require('marked');
const axios = require('axios');
var wordpress = require("wordpress");
const fs = require('fs');

require('dotenv').config({ path: './.env' });

async function autoBlog(blogInfo,db){

  blogInfo.username = blogInfo.blogUsername
  blogInfo.url = blogInfo.blogUrl
  blogInfo.password = blogInfo.blogPassword

  const language = blogInfo.postLanguage
  const client = wordpress.createClient(blogInfo);
  let modelGPT;

  switch (blogInfo.postgpt) {
    case 'gpt4o':
      modelGPT = 'gpt-4o';
      break;
    case 'gpt4o-mini':
      modelGPT = 'gpt-4o-mini';
      break;
    default:
      modelGPT = 'gpt-4o'; // Default to GPT-3 if no match
      break;
  }  

  console.log({modelGPT})
  if(!isBlogInfoComplete(blogInfo)){
    console.log('You need to provide the blog informations')
    return
  }   
  
  console.log(`Generating article for: ${blogInfo.botName}`);

  // Categories
  let promise_categories = addTaxonomy(['RAKUBUN'], 'category', client, language)
    .then(myCategories => {
      let newCategories = blogInfo.postCategory;
      return updateCategories(myCategories, newCategories, 'category', client);
    });

  // Title
  const promptDataTitle = titlePromptGen(blogInfo)
  const untreatedTitle = await moduleCompletion({model:modelGPT,prompt:promptDataTitle,max_tokens:100});
  const fetchTitle = untreatedTitle.trim().replace(/"/g, '')
  console.log(`Generated title : ${fetchTitle}`)
    
  // Tags
  const tagPrompt = categoryPromptGen(fetchTitle, 'post_tag',language)
  let promise_tags = moduleCompletion({model:modelGPT, prompt:tagPrompt,max_tokens:600})
    .then(fetchTag =>{
      let parsedTags = extractArrayFromString(fetchTag.trim());
      if (parsedTags !== null) {
        console.log("Behold, your tags:", parsedTags.toString());
        parsedTags.push('RAKUBUN')
        return addTaxonomy(parsedTags,'post_tag',client,language)
      }else{
        return []
      }
    })

  // Image Generation
  const promptDataImage = imagePromptGen(fetchTitle)
  let promise_image = moduleCompletion({model:modelGPT,prompt:promptDataImage,max_tokens:400})
  .then(fetchPromptImage => {
    return txt2img({prompt:fetchPromptImage,negativePrompt:'',blogId:blogInfo.blogId});
  })
  .then(imageData => { //{ imageID , imageBuffer }
    return new Promise((resolve, reject) => {
      client.uploadFile({
        name: `${imageData.imageID}.png`,
        type: 'image/png',
        bits: imageData.imageBuffer,
      }, (error, file) => {
        if (error) {
          console.log('Error when adding the thumbnail');
          reject(error); // Reject the promise on error
        } else {
          resolve(file); // Resolve the promise with the file on success
        }
      });
    });
  })  
  .catch(error => {
    // Handle any errors in the promise chain
    console.error("Error in image processing");
  });

  // Content
  const promptDataContent = contentPromptGen(fetchTitle, blogInfo);
  let promise_content = moduleCompletion({model: modelGPT, prompt: promptDataContent, max_tokens: 2000})


  
  // Post
  let promise_post = Promise.all([promise_content, promise_categories, promise_tags, promise_image])
    .then(([content, categories, tags, image]) => {
      try {
        saveArticleUpdateBlog(fetchTitle, content, categories, tags, image, blogInfo);
      } catch (error) {
        console.log(error)
        console.log(`Error Saving Article`)
      }
      return post(fetchTitle, content, categories, tags, image, blogInfo.postStatus, client)
      
    })
    .catch(err=>{
      console.log(err)
    })
    

}

function imagePromptGen(fetchTitle){
  return `
  I will provide a title and you will respond with an image prompt\n
  Here is an example of response : masterpiece, best quality, 1girl, yellow eyes, long hair, white hair, tree, stairs, standing, kimono, sky, cherry blossoms, temple, looking at viewer, upper body, from below, looking back,\n
  Here is the title: ${fetchTitle}.`;
}
function contentPromptGenForSearch(search_results, blogInfo){
  if(search_results){
    return `Using the following JSON informations. ${JSON.stringify(search_results)} .\nProvide a well structued and SEO friendly blog post. You are a professional ${blogInfo.postLanguage} blog writer. Your blog post is entirely in ${blogInfo.postLanguage}`
  }else{
    return `Provide a well structued and SEO friendly blog post. You are a professional ${blogInfo.postLanguage} blog writer. Your blog post is entirely in ${blogInfo.postLanguage}`

  }
}
function contentPromptGen(fetchTitle,blogInfo){
  //return `Write 5 paragraphs related to "${fetchTitle}", a paragraph contain a title and a description about the subject and a link to a REAL up and running ${blogInfo.postLanguage}  website  about the subject. The main keyword/theme is : ${blogInfo.botDescription}.Target audience is : ${blogInfo.targetAudience}.Category :  ${blogInfo.articleCategories}. Language : ${blogInfo.postLanguage}. The titles you provide must engage a broad audience by combining high-profile personnality name with latest drama title or famous places in countries that speaks ${blogInfo.postLanguage}. Your respond MUST be in ${blogInfo.postLanguage}. Write like a profesional ${blogInfo.postLanguage}  blog writer.`
  return  `Write a detailed blog post about "${fetchTitle}".The main keyword/theme is : ${blogInfo.botDescription}.Target audience is : ${blogInfo.targetAudience}.Category :  ${blogInfo.articleCategories}. Language : ${blogInfo.postLanguage}.Craft a well structured content. Style: ${blogInfo.writingStyle}, Tone: ${blogInfo.writingTone}. Use Markdown for formatting.`;
}
function titlePromptGen(blogInfo) {
  return `Provide one specific subject relating to : ["${blogInfo.botDescription}"] tailored to a ${blogInfo.postLanguage}-speaking audience.Choose one subject that fit in those categories ${blogInfo.articleCategories}. Aim for originality. The tone should be ${blogInfo.writingTone}, aligning with the article's ${blogInfo.writingStyle} style. Please respond in ${blogInfo.postLanguage} and prioritize freshness and appeal in your suggestions. The title you provide must engage a broad audience by combining high-profile personnality and famous keywords in the audience country. Respond with the title string only.`;
}  

function extractArrayFromString(fetchTag) {
  const arrayExtractor = /\[.*?\]/; // The spell to locate our array
  const matched = fetchTag.match(arrayExtractor);

  if (matched) {
    try {
      // Attempting to transform the string into a noble array
      const arrayString = matched[0];
      const actualArray = JSON.parse(arrayString);
      return actualArray; // The quest is a success!
    } catch (e) {
      // The spell backfired, alas! The array was a mirage.
      console.error("Oops! Something went wrong during the transformation:", e);
      return null; // Returning a solemn null, as a sign of our failed quest.
    }
  } else {
    // The array was but a legend, nowhere to be found.
    console.log("No array detected in the string. Are you sure it's the right scroll?");
    console.log({fetchTag})
    return null; // A respectful null, acknowledging the absence of our quest's goal.
  }
}


async function updateCategories(myCategories,newCategories,type,client) {
  // Let's handle the case where we need to fetch details first
  if (Array.isArray(newCategories)) {
    // It's an array, time for a group adventure
    const promises = newCategories.map(cat => getTermDetails(cat, type, client));
    const details = await Promise.all(promises);
    // Using map to transform the details into a list of names (or whatever property you need)
    myCategories.push(...details);
  } else {
    if(!newCategories){
      return myCategories
    }
    // It's a single string, a solo mission
    const detail = await getTermDetails(newCategories, type, client);
    myCategories.push(detail);
  }
  return myCategories
}

function isAutoBlogInfoComplete(blogInfo) {
  // A list of ingredients we expect in our potion
  const requiredIngredients = ['blogPassword', 'blogUrl', 'blogUsername'];

  // Checking every ingredient for its presence and clarity
  return requiredIngredients.every(key => blogInfo[key] !== undefined && blogInfo[key] !== '');
}

// Tools

async function saveArticleUpdateBlog(fetchTitle, finalContent, myCategories, myTags, myImages, blogInfo) {

  try {
    // Step 1: Save the article in the articles collection
    const article = {
      title: fetchTitle,
      content: finalContent,
      categories: myCategories,
      tags: myTags,
      blogId: new ObjectId(blogInfo.blogId), // Assuming blogInfo contains blogId
      botId: new ObjectId(blogInfo.botId), // Assuming blogInfo contains blogId
      createdAt: new Date(), // Capture the creation date of the article
      thumbnail:myImages?myImages.attachment_id:null

    };

    const articleResult = await global.db.collection('articles').insertOne(article);
    const articleId = articleResult.insertedId;

    // Step 2: Update the corresponding blog entry to include the new article ID in its articles array
    // Ensure the blogInfos collection and the field that stores the article IDs (e.g., 'articleIds') are correctly named
    const blogUpdateResult = await global.db.collection('blogInfos').updateOne(
      { _id: new ObjectId(blogInfo._id) }, // Use the blogId to find the correct blog
      { $push: { articleIds: articleId } } // Push the new article ID to the articles array
    );

    // Check the result and handle accordingly
    if (blogUpdateResult.modifiedCount === 0) {
      throw new Error('Failed to update the blog with the new article ID.');
    }

    return {
      message: 'Article saved and blog updated successfully',
      articleId: articleId
    };
  } catch (error) {
    console.error('Error saving article and updating blog:', error);
    throw error; // Rethrow or handle as needed
  }
}

async function updateArticleStatus(articleId){
  await global.db.collection('articles').updateOne({_id:new ObjectId(articleId)},{$set:{published:true}})
}
async function getBlogInfo(db,userId){
  const user = await db.collection('users').findOne({_id:new ObjectId(userId)})
  return {password:user.blogPassword,url:user.blogUrl,username:user.blogUsername,theme:user.blogTheme}
}
function isBlogInfoComplete(blogInfo) {
  // A list of ingredients we expect in our potion

  const requiredIngredients = ['password', 'url', 'username'];

  // Checking every ingredient for its presence and clarity
  return requiredIngredients.every(key => blogInfo[key] !== undefined && blogInfo[key] !== '');
}
function isTaxonomyComplete(taxonomy) {
  const requiredFields = ['name', 'description'];
  return requiredFields.every(key => taxonomy[key] !== undefined && taxonomy[key] !== '');
}
async function getLanguage(db,userId){
  const user = await db.collection('users').findOne({_id:new ObjectId(userId)})
  return user.language || 'japanese'
}
async function findActiveFeeds(db){
  return db.collection('feeds').find({'status':'active'}).toArray()
}
function markdownToHtml(markdownString) {
  // Use marked to convert the markdown string to HTML
  const html = marked.parse(markdownString);

  return html;
}
function searchResultsToHtml(processedResults) {

  // Then, transform these results into HTML list items
  const listItemsHtml = processedResults.map(result => {
    return `<li><a href="${result.link}" target="_blank">${result.title}</a></li>`;
  }).join(''); // Join all list items into a single string

  // Finally, wrap the list items in a <ul> element
  return `<ul>${listItemsHtml}</ul>`;
}
function imageSearchToHTML(imageSearch,articleUrl) {
  if (!imageSearch || !imageSearch.length) {
    return '<div>No images found, the gallery is as empty as a cauldron after a potion class.</div>';
  }

  // Begin our HTML gallery with a touch of responsive style
  let html = `<style>
    .image-gallery {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
    }
    /* The spell of responsiveness: one column on screens narrower than 600 pixels */
    @media (max-width: 600px) {
      .image-gallery {
        grid-template-columns: 1fr;
      }
    }
  </style>
  <div class="image-gallery">`;

  // For each image, create a card-like element
  imageSearch.forEach(image => {
    html += `
      <div style="border: 1px solid #ddd; box-shadow: 0px 0px 5px #aaa; margin-bottom: 20px;">
        <a href="${articleUrl}" target="_blank">
          <img src="${image.link}" alt="${image.title}" style="width: 100%; height: auto;">
        </a>
      </div>
    `;
  });

  // Close our gallery div
  html += '</div>';

  return html;
}
function disclaimer(language) {
  switch (language) {
    case 'japanese':
      return '<i>ご注意ください！このページの内容は、私たちのAI仲間によって自動的に生成されました。生成型AIは時に間違った情報を吐き出すこともありますので、この記事の内容を鵜呑みにせず、自分の目で確かめてくださいね。専門的な判断や重要な行動をする前には、信頼できる情報源をチェックすることを忘れずに。</i><br>';
    case 'french':
      return '<i>Attention, chers lecteurs ! Le contenu de cette page a été généré automatiquement par notre complice, l\'IA générative. Comme notre ami l\'IA peut parfois se tromper, ne prenez pas tout ce qui est écrit ici pour parole d\'évangile. Vérifiez par vous-même et consultez des sources fiables avant de prendre des décisions spécialisées ou d\'agir.</i><br>';
    case 'english':
    default:
      return `<i>Heads up, folks! The content on this very page was whipped up automatically by our pal, the generative AI. Since our AI buddy can sometimes mix up its facts, please don't swallow everything you read here hook, line, and sinker. Do your own fact-checking and consult trustworthy sources before making any specialized decisions or taking action.</i><br>`;
  }
}

function categoryPromptGen(title,type,language){
  return  `For a blog post titled: '${title}', provide 5 ${type} names. Respond in ${language} only with a json string array only.Only include the json string , with no variable declaration`
}

function categoryDescriptionPromptGen(category,type,language){
  return  `For a blog ${type}: '${category}', provide a description. Respond in ${language} only.`
}
async function addTaxonomy(taxonomyArray,type,client,language){
  const result = []
  for(let tag of taxonomyArray){
    try {
      const checkTag = await categoryExists(tag,type,client);
      
      if(!checkTag){
        console.log(`Creating new taxonomy (${type}) : ${tag}`)
        const catObj = await createTaxonomy(tag,type,language,client)
        result.push(catObj)
      }else{
        //console.log(`Already exist ${type}: ${tag} ${checkTag}`)
        let categoryDetails = await getTermDetails(checkTag, type, client)
        const isComplete = isTaxonomyComplete(categoryDetails)
        if(!isComplete){
          categoryDetails = await createTaxonomy(categoryDetails.name, type, language, client)
        }
        result.push(categoryDetails)
      }
    } catch (error) {
      console.log(error)
    }
  }
  return result
}
async function createTaxonomy(taxonomyName,type,language, client){
  const tagDescriptionPrompt = categoryDescriptionPromptGen(taxonomyName,type,language)
  const fetchtagDescription = await moduleCompletion({model:"gpt-4o",prompt:tagDescriptionPrompt,max_tokens:600});
  const catObj = {name:capitalizeFirstLetter(taxonomyName),description:fetchtagDescription}
  await ensureCategory(catObj, type, client)
  return catObj
}
function capitalizeFirstLetter(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

module.exports = {autoBlog}