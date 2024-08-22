// AutoBlog
const express = require('express');
const router = express.Router();
const axios = require('axios');
const { ObjectId } = require('mongodb');
const { getCategoryId } = require('../../modules/post')
const { setCronJobForUser } = require('../../modules/cronJobs-bot.js');
const { setCronJobForBlog } = require('../../modules/cronJobs-blog.js');
const {retrieveLatestArticle} = require('../../modules/init-blog')

var wordpress = require("wordpress");

router.get('/info/category/:blogId', async (req, res) => {
  const { blogId } = req.params;

  try{
    const blogInfo = await global.db.collection('blogInfos')
                             .findOne({_id: new ObjectId(blogId), userId: new ObjectId(req.user._id)});

    if (!blogInfo) {
      return res.status(404).json({ message: 'Blog information not found or access denied.' });
    }
    
    blogInfo.username = blogInfo.blogUsername
    blogInfo.url = blogInfo.blogUrl
    blogInfo.password = blogInfo.blogPassword


    const client = wordpress.createClient(blogInfo);

    const categoryIds = await getCategoryId('category',client)

    res.json(categoryIds);
  }catch (error){
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });

  }

});

router.get('/blog-info/:blogId', async (req, res) => {
  const { blogId } = req.params;

  try {
    const blogInfo = await global.db.collection('blogInfos').findOne({_id: new ObjectId(blogId), userId: new ObjectId(req.user._id)});

    if (!blogInfo) {
      return res.status(404).json({ message: 'Blog information not found or access denied.' });
    }
    blogInfo.blogId=blogId
    res.json(blogInfo);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});
router.post('/blog-info', async (req, res) => {

  try {
  const userId = req.user._id;
  const blogData = req.body;
    if(blogData.additionalUrls){
      blogData.additionalUrls = blogData.additionalUrls.filter(url => url !== "");
    }
    const blogId = await saveBlogInfo(userId, blogData);
    setCronJobForBlog(db, blogId, blogData.postFrequency)
    res.status(201).send({ message: 'Blog info saved successfully', blogId });
  } catch (error) {
    console.log(error);
    res.status(500).send('Internal server error');
  }
});
router.delete('/blog/:blogId', async (req, res) => {
  const { blogId } = req.params;

  try {
    // Optional: Check if the blog info belongs to the user before deletion
    const deletionResult = await global.db.collection('blogInfos')
                                  .deleteOne({_id: new ObjectId(blogId), userId: new ObjectId(req.user._id)});
    
    if (deletionResult.deletedCount === 0) {
      return res.status(404).json({ message: 'Blog information not found or access denied.' });
    }

    res.json({ message: 'Blog information deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});
router.post('/duplicate-blog/:blogId', async (req, res) => {
  const { blogId } = req.params;
  try {
    // Fetch the existing blog info
    const blogInfo = await global.db.collection('blogInfos')
                        .findOne({_id: new ObjectId(blogId), userId: new ObjectId(req.user._id)});

    if (!blogInfo) {
      return res.status(404).send('Blog information not found.');
    }

    // Remove the _id property to ensure MongoDB assigns a new _id when inserting
    delete blogInfo._id;
    blogInfo.blogName = blogInfo.blogName + '(DUPLICATE)'
    // Insert the duplicated blog info as a new document
    const insertResult = await global.db.collection('blogInfos').insertOne(blogInfo);

    if (insertResult.acknowledged) {
      // Successfully duplicated, you can redirect or send back success response
      res.send({ message: 'Blog duplicated successfully', newBlogId: insertResult.insertedId });
    } else {
      res.status(500).send('Failed to duplicate blog info.');
    }
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal server error');
  }
});

router.post('/post-blog-article', async (req, res) => {
  const { blogId } = req.body;

  try {
    const blogInfo = await global.db.collection('blogInfos').findOne({_id: new ObjectId(blogId), userId: new ObjectId(req.user._id)});

    if (!blogInfo) {
      return res.status(404).json({ message: 'Blog information not found or access denied.' });
    }

    // Update the database to indicate that a process is in progress
    await global.db.collection('blogInfos').updateOne(
      { _id: new ObjectId(blogId) },
      { $set: { processing: true } }
    );

    // Immediately respond to the client
    res.json({ message: 'Process started.' });

    // Call the function without awaiting its completion
    retrieveLatestArticle(blogInfo, global.db)
      .then(() => {
        // Update the database on success
        global.db.collection('blogInfos').updateOne(
          { _id: new ObjectId(blogId) },
          { $set: { processing: false, lastUpdated: new Date() } }
        );
      })
      .catch((error) => {
        console.error('Error processing latest article:', error);
        // Update the database on failure
        global.db.collection('blogInfos').updateOne(
          { _id: new ObjectId(blogId) },
          { $set: { processing: false, error: 'Failed to process latest article' } }
        );
      });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});


router.get('/bot-info/:botId', async (req, res) => {
  const { botId } = req.params;

  try {
    const botInfo = await global.db.collection('botInfos')
                             .findOne({_id: new ObjectId(botId), userId: new ObjectId(req.user._id)});

    if (!botInfo) {
      return res.status(404).json({ message: 'Blog information not found or access denied.' });
    }
    botInfo.botId = botId
    res.json(botInfo);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});
router.post('/bot-info', async (req, res) => {
  const userId = req.user._id;
  const botData = req.body;

  try {
    const botId = await saveBotInfo(userId, botData);
    const botInfo = await db.collection('botInfos').findOne({ _id: new ObjectId(botId) });

    await setCronJobForUser(db, botId, botInfo.postFrequency)
    res.status(201).send({ message: 'Bot info saved successfully', botId });
  } catch (error) {
    console.log(error);
    res.status(500).send('Internal server error');
  }
});
router.delete('/bot/:botId', async (req, res) => {
  const { botId } = req.params;

  try {
    // Optional: Check if the blog info belongs to the user before deletion
    const deletionResult = await global.db.collection('botInfos')
                                  .deleteOne({_id: new ObjectId(botId), userId: new ObjectId(req.user._id)});
    
    if (deletionResult.deletedCount === 0) {
      return res.status(404).json({ message: 'Blog information not found or access denied.' });
    }

    res.json({ message: 'Blog information deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});
router.post('/duplicate-bot/:botId', async (req, res) => {
  const { botId } = req.params;
  console.log({botId})
  try {
    // Fetch the existing blog info
    const botInfo = await global.db.collection('botInfos')
                        .findOne({_id: new ObjectId(botId), userId: new ObjectId(req.user._id)});

    if (!botInfo) {
      return res.status(404).send('Blog information not found.');
    }

    // Remove the _id property to ensure MongoDB assigns a new _id when inserting
    delete botInfo._id;
    botInfo.botName = botInfo.botName + '(DUPLICATE)'
    // Insert the duplicated blog info as a new document
    const insertResult = await global.db.collection('botInfos').insertOne(botInfo);

    if (insertResult.acknowledged) {
      // Successfully duplicated, you can redirect or send back success response
      res.send({ message: 'Blog duplicated successfully', newBotId: insertResult.insertedId });
    } else {
      res.status(500).send('Failed to duplicate blog info.');
    }
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal server error');
  }
});

//TOOLS
async function saveBlogInfo(userId, blogData) {
  try {
    // Check if blogData contains blogId
    if (blogData.blogId) {
      // Attempt to update the existing blog info
      const blogId = blogData.blogId;
      delete blogData.blogId; // Remove blogId from blogData to prevent it from being updated in the document

      const updateResult = await global.db.collection('blogInfos').updateOne(
        { _id: new ObjectId(blogId), userId: new ObjectId(userId) }, // Ensure that the blog belongs to the user
        { $set: blogData }
      );

      // Check if the document to update was found and modified
      if (updateResult.matchedCount === 0) {
        throw new Error('No matching document found to update');
      }

      return blogId;
    } else {
      console.log(`New blog`)
      // Insert a new blog info document
      const blogInfo = {
        userId: new ObjectId(userId),
        ...blogData
      };
      const insertResult = await global.db.collection('blogInfos').insertOne(blogInfo);
      return insertResult.insertedId;
    }
  } catch (error) {
    console.error("Error saving blog info:", error);
    throw error; // Rethrow the error to be handled by the caller
  }
}
async function saveBotInfo(userId, botData) {

  try {
    // Check if blogData contains blogId
    if (botData.botId && botData.botId != '') {
      // Attempt to update the existing blog info
      const botId = botData.botId;
      delete botData.botId; // Remove blogId from botData to prevent it from being updated in the document

      const updateResult = await global.db.collection('botInfos').updateOne(
        { _id: new ObjectId(botId), userId: new ObjectId(userId) }, // Ensure that the blog belongs to the user
        { $set: botData }
      );

      // Check if the document to update was found and modified
      if (updateResult.matchedCount === 0) {
        throw new Error('No matching document found to update');
      }

      return botId;
    } else {
      console.log(`New blog`)
      // Insert a new blog info document
      const botInfo = {
        userId: new ObjectId(userId),
        ...botData
      };
      
      const insertResult = await global.db.collection('botInfos').insertOne(botInfo);
      return insertResult.insertedId;
    }
  } catch (error) {
    console.error("Error saving blog info:", error);
    throw error; // Rethrow the error to be handled by the caller
  }
}

module.exports = router