const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const multer = require('multer');
const path = require('path');
const aws = require('aws-sdk');
const { createHash } = require('crypto');
const mime = require('mime-types');
const { checkIfAdmin } = require('../../services/tools')

// AWS S3 Configuration
const s3 = new aws.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID, // Ensure these environment variables are set
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION
});

// Function to upload buffer to S3
const uploadToS3 = async (buffer, hash, filename) => {
    const contentType = mime.lookup(path.extname(filename)) || 'application/octet-stream';
    const params = {
        Bucket: process.env.AWS_S3_BUCKET_NAME,
        Key: `${hash}_${filename}`,
        Body: buffer,
        ContentType: contentType
    };
    try {
        const uploadResult = await s3.upload(params).promise();
        return uploadResult.Location; // URL of the uploaded image
    } catch (error) {
        console.error("S3 Upload Error:", error);
        throw error;
    }
};

// Function to handle file upload and deduplication
const handleFileUpload = async (file, db) => {
    const buffer = file.buffer;
    const hash = createHash('md5').update(buffer).digest('hex');
    const awsimages = db.collection('awsimages');

    // Check if the image already exists in MongoDB
    const existingFile = await awsimages.findOne({ hash });
    if (existingFile) {
        console.log(`Already exists in DB: ${existingFile.key}`);
        return `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${existingFile.key}`;
    }

    // Check if the image already exists in S3
    const existingFiles = await s3.listObjectsV2({
        Bucket: process.env.AWS_S3_BUCKET_NAME,
        Prefix: hash
    }).promise();

    if (existingFiles.Contents.length > 0) {
        console.log(`Already exists in S3: ${existingFiles.Contents[0].Key}`);
        await awsimages.insertOne({ key: existingFiles.Contents[0].Key, hash });
        return `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${existingFiles.Contents[0].Key}`;
    } else {
        // Upload to S3
        const uploadUrl = await uploadToS3(buffer, hash, file.originalname);
        const key = uploadUrl.split('/').slice(-1)[0];
        await awsimages.insertOne({ key, hash });
        return uploadUrl;
    }
};

// Multer Memory Storage Configuration
const storage = multer.memoryStorage();

// File filter to allow only image files
const fileFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const mimetype = allowedTypes.test(file.mimetype);
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    if (mimetype && extname) {
        return cb(null, true);
    }
    cb(new Error('Only image files are allowed!'));
};

const uploadMulter = multer({ 
    storage: storage,
    fileFilter: fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Route to handle A/B test creation
router.post('/create-ab-test', uploadMulter.fields([
    { name: 'imageA', maxCount: 1 }, 
    { name: 'imageB', maxCount: 1 }
]), async (req, res) => {
    try {
        const {
            imageAName,
            imageATargetUrl,
            imageBName,
            imageBTargetUrl,
            affiliateId // Assuming affiliateId is sent from the frontend
        } = req.body;

        const imageAFile = req.files['imageA'] ? req.files['imageA'][0] : null;
        const imageBFile = req.files['imageB'] ? req.files['imageB'][0] : null;

        // Validate required fields
        if (!imageAName || !imageBName || !imageAFile || !imageBFile) {
            return res.status(400).json({ message: 'Image names, target URLs, and both images are required.' });
        }

        // Validate affiliateId if provided
        let affiliateObjectId = null;
        if (affiliateId) {
            if (!ObjectId.isValid(affiliateId)) {
                return res.status(400).json({ message: 'Invalid affiliateId format.' });
            }
            affiliateObjectId = new ObjectId(affiliateId);
        }
        const userId = new ObjectId(req.user._id);

        // Create a unique testId
        const testId = new ObjectId().toString();

        // Upload images to S3
        const imageAUrl = await handleFileUpload(imageAFile, global.db);
        const imageBUrl = await handleFileUpload(imageBFile, global.db);

        // Prepare image data
        const imageAId = new ObjectId().toString();
        const imageBId = new ObjectId().toString();

        const imageAData = {
            imageId: imageAId,
            imageName: imageAName,
            imageUrl: imageAUrl,
            targetUrl: imageATargetUrl,
            variant: 'A',
            clickCount: 0,
            viewCount: 0,
            uploadDate: new Date(),
        };

        const imageBData = {
            imageId: imageBId,
            imageName: imageBName,
            imageUrl: imageBUrl,
            targetUrl: imageBTargetUrl,
            variant: 'B',
            clickCount: 0,
            viewCount: 0,
            uploadDate: new Date(),
        };

        // Insert the A/B test into the abTests collection
        await global.db.collection('abTests').insertOne({
            testId,
            userId,
            affiliateId: affiliateObjectId,
            uploadDate: new Date(),
            active: false, // Default to active upon creation
            images: [imageAData, imageBData]
        });

        res.status(200).json({ message: 'A/B Test created successfully.' });
    } catch (error) {
        console.error('Error creating A/B Test:', error);
        res.status(500).json({ message: 'Failed to create A/B Test.', error: error.message });
    }
});

router.get('/get-ab-test-image', async (req, res) => {
    const { affiliateId, abChoice, active } = req.query;
console.log({ affiliateId, abChoice, active })
    if (!affiliateId || !abChoice) {
        return res.status(400).json({ error: 'affiliateId and abChoice parameters are required' });
    }

    try {
        // Fetch the affiliate from the database
        const affiliate = await global.db.collection('affiliate').findOne({ _id: new ObjectId(affiliateId) });
        if (!affiliate) {
            console.log('Affiliate not found')
            return res.status(404).json({ error: 'Affiliate not found' });
        }

        // Fetch active tests
        const matchStage = {
            testId: { $exists: true },
            active: active === 'true' || active === true
        };

        // Fetch the activated images for the A/B test
        const tests = await global.db.collection('abTests').aggregate([
            { $match: matchStage },
            { $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'user' } },
            { $unwind: '$user' },
            { $match: { 'user.credits': { $gte: 0.3 } } },
            { $sample: { size: 1 } },
        ]).toArray();

        if (tests.length === 0) {
            return res.status(404).json({ error: 'No active A/B Test found.' });
        }

        const test = tests[0];
        const image = test.images.find(img => img.variant === abChoice);

        if (!image) {
            return res.status(404).json({ error: `No active image found for variant ${abChoice}.` });
        }

        res.json({
            imageUrl: image.imageUrl,
            imageName: image.imageName,
            targetUrl: image.targetUrl,
            imageId: image.imageId,
            variant: abChoice,
            testId: test.testId,
        });
    } catch (error) {
        console.error('Failed to get A/B test image:', error);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// Endpoint to activate/deactivate an A/B test
router.patch('/activate-test', async (req, res) => {
    const { testId, active } = req.body;

    if (!testId || typeof active === 'undefined') {
        return res.status(400).json({ error: 'testId and active parameters are required.' });
    }

    try {
        // Validate testId format
        if (!ObjectId.isValid(testId)) {
            return res.status(400).json({ error: 'Invalid testId format.' });
        }

        // If activating, check if user has enough credits

        const isAdmin = await checkIfAdmin(req.user)
        if (active && !isAdmin) {
            const abTest = await global.db.collection('abTests').findOne({ testId: testId });
            if (!abTest) {
                return res.status(404).json({ error: 'A/B Test not found.' });
            }
            
            const userId = abTest.userId ? new ObjectId(abTest.userId) : req.user._id;
            const user = await global.db.collection('users').findOne({ _id: userId });
            if (!user) {
                return res.status(404).json({ error: 'User not found.' });
            }
            const minimumCredits = 500;
            const userCredit = user.credits ? user.credits : 0 
            if (userCredit < minimumCredits) {
                return res.status(403).json({ error: 'A/Bテストをアクティブにするためのクレジットが不足しています。' });
            }
        }

        // Update the active status in the abTests collection
        const result = await global.db.collection('abTests').updateOne(
            { testId: testId },
            { $set: { active: active } }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ error: 'A/B Test not found.' });
        }

        return res.json({ message: `A/B Test has been ${active ? 'activated' : 'deactivated'} successfully.` });
    } catch (error) {
        console.error('Failed to update A/B Test status:', error);
        res.status(500).json({ error: 'Internal server error.' });
    }
});


// Endpoint to delete an A/B test by testId
router.delete('/delete-ab-test/:testId', async (req, res) => {
    const { testId } = req.params;

    try {
        if (!testId) {
            return res.status(400).json({ error: 'testId parameter is required.' });
        }

        // Validate testId format
        if (!ObjectId.isValid(testId)) {
            return res.status(400).json({ error: 'Invalid testId format.' });
        }

        // Find the test
        const test = await global.db.collection('abTests').findOne({ testId: testId });
        if (!test) {
            return res.status(404).json({ error: 'Specified A/B Test not found.' });
        }

        // Delete images from S3
        for (const img of test.images) {
            const key = img.imageUrl.split('/').slice(-1)[0];
            await s3.deleteObject({
                Bucket: process.env.AWS_S3_BUCKET_NAME,
                Key: key
            }).promise();
        }

        // Delete the test from abTests collection
        await global.db.collection('abTests').deleteOne({ testId: testId });

        // Delete related entries from awsimages if still used
        // Assuming awsimages are no longer needed if using abTests
        // Otherwise, modify accordingly
        await global.db.collection('awsimages').deleteMany({ key: { $in: test.images.map(img => img.imageUrl.split('/').slice(-1)[0]) } });

        // Delete related clicks and views
        await global.db.collection('abTestClicks').deleteMany({ testId: testId });
        await global.db.collection('abTestViews').deleteMany({ testId: testId });

        res.json({ message: 'A/B Test deleted successfully.' });
    } catch (error) {
        console.error('Failed to delete A/B Test:', error);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// Endpoint to register click event
router.get('/register-click', async (req, res) => {
    const { affiliateId, testId, imageId } = req.query;

    if (!affiliateId || !testId || !imageId) {
        return res.status(400).json({ error: 'affiliateId, testId, and imageId parameters are required.' });
    }

    try {
        // Validate affiliateId format
        if (!ObjectId.isValid(affiliateId)) {
            return res.status(400).json({ error: 'Invalid affiliateId format.' });
        }

        // Validate testId format
        if (!ObjectId.isValid(testId)) {
            return res.status(400).json({ error: 'Invalid testId format.' });
        }

        // Validate imageId (assuming imageId is a string)
        if (typeof imageId !== 'string' || imageId.trim() === '') {
            return res.status(400).json({ error: 'Invalid imageId format.' });
        }

        // Verify that the affiliate exists
        const affiliate = await global.db.collection('affiliate').findOne({ _id: new ObjectId(affiliateId) });
        if (!affiliate) {
            return res.status(404).json({ error: 'Affiliate not found.' });
        }

        // Find the A/B test by testId
        const test = await global.db.collection('abTests').findOne({ testId: testId });
        if (!test) {
            return res.status(404).json({ error: 'A/B Test not found.' });
        }

        //Deduct 1 credit and deactivate ads if necessary
        const advertiserId = new ObjectId(test.userId);
        const user = await global.db.collection('users').findOne({ _id: advertiserId });
        const isAdmin = await checkIfAdmin(user)
        if(!isAdmin){
            if (user.credits < 1) {
            await global.db.collection('abTests').updateMany({ userId: advertiserId }, { $set: { active: false } });
            return res.status(403).json({ error: 'Insufficient credits.' });
            }
            await global.db.collection('users').updateOne({ _id: advertiserId }, { $inc: { credits: -1 } });
        }

        // Find the specific image within the test
        const image = test.images.find(img => img.imageId === imageId);
        if (!image) {
            return res.status(404).json({ error: 'Image not found in the specified A/B Test.' });
        }

        // Check if the test is active
        if (!test.active) {
            return res.status(403).json({ error: 'A/B Test is not active.' });
        }

        // Get the current date in YYYY-MM-DD format
        const today = new Date().toISOString().split('T')[0];

        // Log the click event
        await global.db.collection('abTestClicks').insertOne({
            affiliateId: new ObjectId(affiliateId),
            imageId: imageId,
            testId: testId,
            date: today,
            timestamp: new Date(),
        });

        // Increment the click count for the specific image within the test
        const updateResult = await global.db.collection('abTests').updateOne(
            { testId: testId, "images.imageId": imageId },
            { $inc: { "images.$.clickCount": 1 } }
        );

        if (updateResult.modifiedCount === 0) {
            return res.status(500).json({ error: 'Failed to increment click count.' });
        }

        res.json({ message: 'Click event registered successfully.' });
    } catch (error) {
        console.error('Failed to register click event:', error);
        res.status(500).json({ error: 'Internal server error.' });
    }
});


// Endpoint to register view event
router.get('/register-view', async (req, res) => {
    const { affiliateId, testId, imageId } = req.query;

    if (!affiliateId || !testId || !imageId) {
        return res.status(400).json({ error: 'affiliateId, testId, and imageId parameters are required.' });
    }

    try {
        // Validate affiliateId format
        if (!ObjectId.isValid(affiliateId)) {
            return res.status(400).json({ error: 'Invalid affiliateId format.' });
        }

        // Validate testId format
        if (!ObjectId.isValid(testId)) {
            return res.status(400).json({ error: 'Invalid testId format.' });
        }

        // Validate imageId (assuming imageId is a string)
        if (typeof imageId !== 'string' || imageId.trim() === '') {
            return res.status(400).json({ error: 'Invalid imageId format.' });
        }

        // Verify that the affiliate exists
        const affiliate = await global.db.collection('affiliate').findOne({ _id: new ObjectId(affiliateId) });
        if (!affiliate) {
            return res.status(404).json({ error: 'Affiliate not found.' });
        }

        // Find the A/B test by testId
        const test = await global.db.collection('abTests').findOne({ testId: testId });
        if (!test) {
            return res.status(404).json({ error: 'A/B Test not found.' });
        }

        //Deduct 0.3 credits and deactivate ads if necessary
        const advertiserId = new ObjectId(test.userId);
        const user = await global.db.collection('users').findOne({ _id: advertiserId });
        const isAdmin = await checkIfAdmin(user)
        if(!isAdmin){
            if (user.credits < 0.3) {
            await global.db.collection('abTests').updateMany({ userId: advertiserId }, { $set: { active: false } });
            return res.status(403).json({ error: 'Insufficient credits.' });
            }
            await global.db.collection('users').updateOne({ _id: advertiserId }, { $inc: { credits: -0.3 } });
        }

        // Find the specific image within the test
        const image = test.images.find(img => img.imageId === imageId);
        if (!image) {
            return res.status(404).json({ error: 'Image not found in the specified A/B Test.' });
        }

        // Check if the test is active
        if (!test.active) {
            return res.status(403).json({ error: 'A/B Test is not active.' });
        }

        // Get the current date in YYYY-MM-DD format
        const today = new Date().toISOString().split('T')[0];

        // Log the view event
        await global.db.collection('abTestViews').insertOne({
            affiliateId: new ObjectId(affiliateId),
            imageId: imageId,
            testId: testId,
            date: today,
            timestamp: new Date(),
        });

        // Increment the view count for the specific image within the test
        const updateResult = await global.db.collection('abTests').updateOne(
            { testId: testId, "images.imageId": imageId },
            { $inc: { "images.$.viewCount": 1 } }
        );

        if (updateResult.modifiedCount === 0) {
            return res.status(500).json({ error: 'Failed to increment view count.' });
        }

        res.json({ message: 'View event registered successfully.' });
    } catch (error) {
        console.error('Failed to register view event:', error);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// Endpoint to get A/B test results for the current user
router.get('/get-ab-test-results', async (req, res) => {
    try {
        const userId = new ObjectId(req.query.userId)

        // Define the date range (last 7 days)
        const today = new Date();
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(today.getDate() - 6); // Including today

        // Adjust start and end dates
        const startDate = new Date(sevenDaysAgo.setHours(0, 0, 0, 0));
        const endDate = new Date(today.setHours(23, 59, 59, 999));

        // Build the match stage to match A/B tests belonging to the current user
        let matchStage = {
            userId: userId
        };

        // Aggregation pipeline
        const pipeline = [
            {
                $match: matchStage
            },
            {
                $lookup: {
                    from: 'abTestClicks',
                    let: { testId: '$testId' },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $eq: ['$testId', '$$testId']
                                }
                            }
                        },
                        {
                            $group: {
                                _id: null,
                                totalClicks: { $sum: 1 }
                            }
                        }
                    ],
                    as: 'clickData'
                }
            },
            {
                $lookup: {
                    from: 'abTestViews',
                    let: { testId: '$testId' },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $eq: ['$testId', '$$testId']
                                }
                            }
                        },
                        {
                            $group: {
                                _id: null,
                                totalViews: { $sum: 1 }
                            }
                        }
                    ],
                    as: 'viewData'
                }
            },
            {
                $addFields: {
                    totalClicks: { $ifNull: [{ $arrayElemAt: ['$clickData.totalClicks', 0] }, 0] },
                    totalViews: { $ifNull: [{ $arrayElemAt: ['$viewData.totalViews', 0] }, 0] }
                }
            },
            {
                $project: {
                    _id: 0,
                    testId: 1,
                    uploadDate: 1,
                    images: 1,
                    totalClicks: 1,
                    totalViews: 1,
                    active: 1
                }
            },
            {
                $sort: { uploadDate: -1 }
            }
        ];

        // Execute the aggregation pipeline
        const results = await global.db.collection('abTests').aggregate(pipeline).toArray();

        res.json(results);
    } catch (error) {
        console.log('Failed to get A/B test results:', error);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

module.exports = router;
