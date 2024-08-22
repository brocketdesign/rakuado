const AWS = require('aws-sdk');

// Configure the AWS region of the S3 bucket
AWS.config.update({
  region: 'ap-northeast-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

const s3 = new AWS.S3();

function uploadFileToS3(fileContent, fileName) {
  const params = {
    Bucket: process.env.S3_BUCKET_NAME,
    Key: fileName,
    Body: fileContent,
  };

  return new Promise((resolve, reject) => {
    s3.upload(params, function(err, data) {
      if (err) {
        return reject(err);
      }
      resolve({
        url: data.Location,
        buffer: fileContent
      });
    });
  });
}


/**
 * Test access to the specified S3 bucket.
 * @param {string} bucketName - The name of the S3 bucket to access.
 * @returns {Promise} - A promise that resolves with the list of objects in the bucket or an error message.
 */
function testS3Access(bucketName) {
    const params = {
      Bucket: bucketName
    };
  
    return new Promise((resolve, reject) => {
      s3.listObjectsV2(params, (err, data) => {
        if (err) {
          console.error("Error accessing S3:", err);
          reject(err);
        } else {
          console.log("Successfully accessed S3. Data:", data);
          resolve(data);
        }
      });
    });
  }
  

module.exports = {uploadFileToS3}