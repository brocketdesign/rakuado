// cronjob.js
const cron = require('node-cron');
const { ObjectId } = require('mongodb');
const {autoBlog} = require('./init-bot')

let cronJobsMap = {};

// Function to set a cron job for a user
const setCronJobForUser = async (db, botId, schedule) => {

  if (process.env.NODE_ENV !== 'local') {
    //return
  } 
  
  const botInfo = await db.collection('botInfos').findOne({ _id: new ObjectId(botId) });
  const blogInfo = await db.collection('blogInfos').findOne({ _id: new ObjectId(botInfo.blogId) });

  if (cronJobsMap[botId] ) {
    cronJobsMap[botId].stop();
  }
  
  if(!botInfo || !botInfo.isActive){
    if (cronJobsMap[botId] ) {
      cronJobsMap[botId].stop();
    }
    console.log(`Stop job for bot ${botId}`)
    return
  }
  botInfo.botId = botInfo._id
  blogInfo.blogId = blogInfo._id
  const combinedPowers = { ...botInfo, ...blogInfo };

  autoBlog(combinedPowers,db)
  console.log(`Set job for blog ${botId} at ${botInfo.postFrequency}`)
  cronJobsMap[botId] = cron.schedule(botInfo.postFrequency, () => {
    console.log(`Doing something for blog ${botId}`);
    autoBlog(combinedPowers,db)
  });
};

// Function to initialize all cron jobs from database at app start
const initializeCronJobs = async (db) => {
  if (process.env.NODE_ENV !== 'local') {
    //return
  } 

  // Assuming you have a function to get all user schedules from your database
  const bots = await db.collection('botInfos').find({ isActive: true }).toArray(); // You'll need to implement this
  bots.forEach(bot => {
    setCronJobForUser(db, bot._id, bot.postFrequency);
  });
  //RSS auto blog post
  //rsspost(db)
  let rssJob = cron.schedule('*/10 * * * *', () => {
    //rsspost(db)
  });
};


module.exports = { setCronJobForUser, initializeCronJobs };

