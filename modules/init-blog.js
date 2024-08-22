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
const cheerio = require('cheerio');
var wordpress = require("wordpress");
const fs = require('fs');
require('dotenv').config({ path: './.env' });
const xmlrpc = require("xmlrpc");

// Async function to retrieve and process the latest article using direct URLs
async function retrieveLatestArticle(blogInfo, db) {
  try {
      // Loop through all blog URLs directly from the blogInfo object
      for (let blogUrl of blogInfo.additionalUrls) {  // Assume blogInfo contains an array of URLs
          if (!blogUrl) continue; // Skip if no URL is provided

          // Fetch the latest posts from the WordPress blog using the direct URL
          const response = await axios.get(`${blogUrl}/wp-json/wp/v2/posts`);
          const posts = response.data;

          // Check each post to find one that hasn't been processed
          for (let post of posts) {
              // Check if the post has already been processed
              const existingPost = await db.collection('posts').findOne({ wordpressId: post.id, status: 'done' });

              // If the post hasn't been processed yet, process it
              if (!existingPost) {
                  const articleData = {
                      title: post.title.rendered,
                      content: post.content.rendered
                  };

                  // Fire the generateAndPost function to process and update the post
                  await generateAndPost(blogInfo, articleData, db);

                  console.log('Update the post status to "done" to avoid reprocessing')
                  await db.collection('posts').updateOne(
                      { wordpressId: post.id },
                      { $set: { status: 'done' } },
                      { upsert: true }
                  );
                  

                  return articleData; // Return the processed article data
              }
          }
      }
  } catch (error) {
      console.error('Failed to retrieve or process articles:', error);
  }
  return null; // Return null if no unprocessed posts are found
}


async function generateAndPost(blogInfo,articleData,db){

  //Blog infod
  blogInfo.username = blogInfo.blogUsername
  blogInfo.url = blogInfo.blogUrl
  blogInfo.password = blogInfo.blogPassword
  const language = blogInfo.postLanguage
  const client = wordpress.createClient(blogInfo);
  let modelGPT;
  switch (blogInfo.postgpt) {
    case 'gpt4':
      modelGPT = 'gpt-4-0125-preview';
      break;
    case 'gpt4o':
      modelGPT = 'gpt-4o';
      break;
    default:
      modelGPT = 'gpt-3.5-turbo-0125'; // Default to GPT-3 if no match
      break;
  }  

  console.log({modelGPT})
  if(!isBlogInfoComplete(blogInfo)){
    console.log('You need to provide the blog informations')
    return
  }   

  //Article generation
  console.log(`Generating article for: ${articleData.title}`);

  let promise_image = Promise.resolve(null);
  if (process.env.NODE_ENV == 'local') {
      // Image Generation
      const promptDataImage = imagePromptGen(articleData.title)
      promise_image = moduleCompletion({model:modelGPT,role:'stable diffusion prompt generator', prompt:promptDataImage,max_tokens:500})
      .then(fetchPromptImage => {
        return txt2img({prompt:fetchPromptImage,negativePrompt:'',aspectRatio:'5:4',height:816,blogId:blogInfo._id});
      })
      .then(imageData => {
        const imageBuffer = imageData.imageBuffer;
        // Wrap the callback in a promise
        return new Promise((resolve, reject) => {
          client.uploadFile({
            name: `${imageData.imageID}.png`,
            type: 'image/png',
            bits: imageBuffer,
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
        console.log(error)
        console.error("Error in image processing");
      });
  }


  // Categories
  let promise_categories = addTaxonomy(['ニュース'], 'category', client, language)
    .then(myCategories => {
      let newCategories = blogInfo.postCategory;
      return updateCategories(myCategories, newCategories, 'category', client);
    });
  //Google search
  let promise_google = getSearchResult(articleData.title).then((results)=>{
    const result = searchResultsToHtml(results)
    return result
  })

  // Content
  let promise_content =  moduleCompletion({model: modelGPT,role:`You are a profesionnal ${blogInfo.language} blog writer` ,prompt: contentPrompt(articleData.content), max_tokens: 4096})
  .then(fetchContent => {
    const convertContentHTML = markdownToHtml(fetchContent);
    return convertContentHTML
  });

  // Tags
  const tagPrompt = categoryPromptGen(articleData.title, 'post_tag',language)
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
  
  // Post
  async function processAndPostArticles() {
    try {
      const [content, google, categories, tags, image] = await Promise.all([
        promise_content, 
        promise_google, 
        promise_categories, 
        promise_tags, 
        promise_image
      ]);
  
      const fetchTitle = extractH1orFirstSentence(content);
      const new_content = `${content}</br> ${google}`;
  
      // Assuming saveArticleUpdateBlog is async, use await to ensure it completes before moving on.
      await saveArticleUpdateBlog(fetchTitle, new_content, categories, tags, image, blogInfo);
  
      // Assuming post is an async function
      return await post(fetchTitle, new_content, categories, tags, image, client);
    } catch (err) {
      console.error(err);
      console.log('Error in processing or posting the article');
    }
  }
  
  await processAndPostArticles();


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
function contentPrompt(content){
  return `Write a blog post on the same subject as  the following :${content} \nProvide a new fresh and well structured blog post.Include the social media post but avoid share links links . Include relevant images. Avoid paraphrasing. Use a friendly tone and respond in japanese. Respond using markdown. Do not include html related to the website. I want to create a new original blog post for my own blog. `
}
function categoryPromptGen(title,type,language){
  return  `For a blog post titled: '${title}', provide 5 ${type} names. Respond in ${language} only with a json string array only.Only include the json string , with no variable declaration`
}
function categoryDescriptionPromptGen(category,type,language){
  return  `For a blog ${type}: '${category}', provide a description. Respond in ${language} only.`
}
function imagePromptGen(fetchTitle){
  return `Provide an image prompt for a thumbnail for an article titled : ${fetchTitle}. DO NOT INCLUDE ANY HUMAN FACE.`;
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
      blogId: new ObjectId(blogInfo._id), // Assuming blogInfo contains blogId
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
function extractH1orFirstSentence(html) {
  const $ = cheerio.load(html);
  const h1Text = $('h1').first().text().trim();

  // Check if there's text in the first H1 found
  if (h1Text) {
    return h1Text;
  }

  // If no H1, extract the first sentence from the text
  // This is a simple approach and might need adjustments based on actual HTML content
  const bodyText = $('body').text().trim();
  let firstSentence
  if(bodyText.indexOf('。'>0)){
    firstSentence = bodyText.split('。')[0] + '。';
    return firstSentence;
  }
    firstSentence = bodyText.split('. ')[0] + '.';
    return firstSentence;
}

module.exports = {generateAndPost,retrieveLatestArticle}