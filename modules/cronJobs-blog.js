// cronjob.js
const cron = require('node-cron');
const { ObjectId } = require('mongodb');
const {generateAndPost,retrieveLatestArticle} = require('./init-blog')

let cronJobsMap = {};

// Function to set a cron job for a blog
const setCronJobForBlog = async (db, blogId, schedule) => {

  const blogInfo = await db.collection('blogInfos').findOne({ _id: new ObjectId(blogId) });

  if (cronJobsMap[blogId]) {
    cronJobsMap[blogId].stop();
  }
  
  if (!blogInfo || !blogInfo.isActive) {
    if (cronJobsMap[blogId]) {
      cronJobsMap[blogId].stop();
    }
    console.log(`Cron job stopped for blog ${blogId}`);
    return;
  }

  blogInfo.blogId = blogInfo._id;
  console.log(`Setting cron job for blog ${blogId} with frequency ${blogInfo.postFrequency}`);

  cronJobsMap[blogId] = cron.schedule(blogInfo.postFrequency, () => {
    console.log(`Running cron job for blog ${blogId}`);
    retrieveLatestArticle(blogInfo, db);
  });
};

// Function to initialize all cron jobs for blogs from database at app start
const initializeCronJobsForBlogs = async (db) => {
  if (process.env.NODE_ENV !== 'local') {
    return;
  }

  const blogs = await db.collection('blogInfos').find({ isActive: true }).toArray();
  blogs.forEach(blog => {
    if(blog.postFrequency){
      setCronJobForBlog(db, blog._id, blog.postFrequency);
    }
  });
};

module.exports = {setCronJobForBlog, initializeCronJobsForBlogs}
