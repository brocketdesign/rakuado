// Section generator
const express = require('express');
const router = express.Router();
const axios = require('axios');
const { ObjectId } = require('mongodb');
const {fetchOpenAICompletion,fetchOllamaCompletion}=require('../../modules/openai')
const {generatePrompt} =require('../../services/prompt')


router.post('/generate/:type', async (req, res) => {
  const type = req.params.type;
  const request_data = generatePrompt(req.body, type);
  console.log({request_data,type})

  try {

    const insertedId = await saveAndId(req, request_data, type);
    res.json({
      redirect: `/api/generator/stream/${type}?id=${insertedId}`,
      insertedId: insertedId
    });

  } catch (error) {

    console.log(error);
    res.status(500).send('Internal server error');
    
  }
});

router.get('/stream/:type', async (req, res) => {
  const type = req.params.type;
  const stream_id = req.query.id;

  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  res.flushHeaders(); // Flush the headers to establish the SSE connection

  try {
      // Fetch the prompt from the database using the provided id
      const record = await global.db.collection('openai').findOne({ _id: new ObjectId(stream_id) });

      if (!record) {
          res.write('data: {"error": "Record not found"}\n\n');
          res.end();
          return;
      }

      const prompt = record.request_data.prompt;
      const messages = [
          { role: 'system', content: 'You are a proficient blog writer.' },
          { role: 'user', content: prompt },
      ];

      const fullCompletion = await fetchOpenAICompletion(messages,record.request_data.max_tokens, res);

      // 文字列内のダブルクォートと改行をエスケープ
      const completionEscaped = parseOpenAIResponse(fullCompletion); //fullCompletion.replace(/"/g, '\\"').replace(/\n/g, '\\n');

      // Update the database with the full completion
      await global.db.collection('openai').updateOne(
          { _id: new ObjectId(stream_id) },
          { $push: { completion: completionEscaped,completion_time:new Date() } }
      );
      
      const data = JSON.stringify({
        id: stream_id,
        completion: completionEscaped
      });
    
      // Write the SSE message
      res.write('event: end\n');
      res.write(`data: ${data}\n\n`);
      res.flush(); // Flush the response to send the data immediately
      res.end();
  } catch (error) {
      console.log(error);
      res.write('data: {"error": "Internal server error"}\n\n');
      res.end();
  }
});

router.get('/data', async (req, res) => {
  const id = req.query.id;
  try{
    const data = await global.db.collection('openai').findOne({ _id: new ObjectId(id) });
    res.status(200).json(data)
  }catch{
    console.log(`${id} not founded`)
  }
});

router.post('/seoSearch', async (req, res) => {
  const keywords = req.body.KEYWORDS;
  console.log({keywords})
  try{
    const formattedKeywords = keywords.join(', ');
    console.log({formattedKeywords})
    const seoSearch = await getSearchResult(formattedKeywords) 
    console.log({seoSearch})
    res.status(200).json({data:seoSearch})
  }catch{
    console.log(`Error making a search`)
  }
});

module.exports = router

async function getSearchResult(query) {
  const google = {
      api_id: process.env.GOOGLE_RAKUBUN_API,
      engine_id: process.env.GOOGLE_SEARCH_ENGINE_ID
  };

  const url = new URL(`https://www.googleapis.com/customsearch/v1?key=${google.api_id}&cx=${google.engine_id}&q=${query}&num=10`).href;

  try {
      const response = await axios.get(url);
      return processSearchResults(response.data); // Contains the search results
  } catch (error) {
      console.error('Error fetching search results:', error);
      return null; // Or handle the error as needed
  }
}

function processSearchResults(data) {
if (!data || !data.items) {
    console.error('Invalid or empty search data');
    return [];
}
// Process the search results here
// For example, extract titles and links
return data.items.map(item => {
    return {title:item.title,link:item.link};
});
}

function parseOpenAIResponse(responseText) {
  const cleanedResponse = responseText.replace(/\n/g, '');
  return cleanedResponse.trim().split('#').filter(title => title.trim().length);
}

async function saveAndId(req, request_data, type) {
  const result = await global.db.collection('openai').insertOne({
    userID: req.user._id,
    request: req.body,
    request_data,
    prompt_time: new Date(),
    type
  });

  const insertedId = result.insertedId;

  global.db.collection('users').updateOne(
    { _id: new ObjectId(req.user._id) },
    { $push: { [`openai_${type}`]: insertedId } }
  );
  return insertedId;
}
