const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const multer = require('multer');
const path = require('path');
const aws = require('aws-sdk');
const { createHash } = require('crypto');
const mime = require('mime-types');

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

        // Create a unique testId
        const testId = new ObjectId().toString();

        // Upload images to S3
        const imageAUrl = await handleFileUpload(imageAFile, global.db);
        const imageBUrl = await handleFileUpload(imageBFile, global.db);

        // Generate unique IDs for images
        const imageAId = new ObjectId();
        const imageBId = new ObjectId();

        // Prepare image data with testId
        const imageAData = {
            _id: imageAId,
            imageId: imageAId.toString(),
            testId: testId,
            imageName: imageAName,
            imageUrl: imageAUrl,
            targetUrl: imageATargetUrl,
            variant: 'A',
            clickCount: 0,
            viewCount: 0,
            uploadDate: new Date(),
            active: true,
            affiliateId: affiliateObjectId
        };

        const imageBData = {
            _id: imageBId,
            imageId: imageBId.toString(),
            testId: testId,
            imageName: imageBName,
            imageUrl: imageBUrl,
            targetUrl: imageBTargetUrl,
            variant: 'B',
            clickCount: 0,
            viewCount: 0,
            uploadDate: new Date(),
            active: true,
            affiliateId: affiliateObjectId
        };

        // Insert images into the database
        await global.db.collection('abTestImages').insertMany([imageAData, imageBData]);

        res.status(200).json({ message: 'A/B Test created successfully.' });
    } catch (error) {
        console.error('Error creating A/B Test:', error);
        res.status(500).json({ message: 'Failed to create A/B Test.', error: error.message });
    }
});

// Endpoint to get A/B test image data
router.get('/get-ab-test-image', async (req, res) => {
    const { affiliateId, abChoice } = req.query;

    if (!affiliateId || !abChoice) {
        return res.status(400).json({ error: 'affiliateId and abChoice parameters are required' });
    }

    try {
        // Fetch the affiliate from the database
        const affiliate = await global.db.collection('affiliate').findOne({ _id: new ObjectId(affiliateId) });
        if (!affiliate) {
            return res.status(404).json({ error: 'Affiliate not found' });
        }

        // Fetch the activated images for the A/B test
        const imageData = await global.db.collection('abTestImages').aggregate([
            { 
                $match: { 
                    variant: abChoice,
                    active: true // Ensure only active images are fetched
                } 
            },
            { $sample: { size: 1 } } // Randomly select one image from the variant
        ]).toArray();

        if (imageData.length === 0) {
            return res.status(404).json({ error: 'No active image found for the selected variant' });
        }

        const image = imageData[0];

        res.json({
            imageUrl: image.imageUrl,
            imageName: image.imageName,
            targetUrl: image.targetUrl,
            imageId: image.imageId,
            variant: abChoice,
        });
    } catch (error) {
        console.error('Failed to get A/B test image:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Endpoint to activate/deactivate an A/B test image
router.patch('/activate-image', async (req, res) => {
    const { imageId } = req.body;
    let { active } = req.body;

    if (!imageId || typeof active === 'undefined') {
        return res.status(400).json({ error: 'imageId and active parameters are required.' });
    }

    // Convert active to boolean
    active = active === true || active === 'true';

    try {
        // Validate imageId format
        if (!ObjectId.isValid(imageId)) {
            return res.status(400).json({ error: 'Invalid imageId format.' });
        }

        // Update the active status
        const result = await global.db.collection('abTestImages').updateOne(
            { imageId: imageId },
            { $set: { active: active } }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ error: 'Image not found.' });
        }

        res.json({ message: `Image ${active ? 'activated' : 'deactivated'} successfully.` });
    } catch (error) {
        console.error('Failed to update image status:', error);
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

        // Find all images associated with the testId
        const images = await global.db.collection('abTestImages').find({ testId: testId }).toArray();

        if (images.length === 0) {
            return res.status(404).json({ error: 'Specified A/B Test not found.' });
        }

        // Delete images from S3
        for (const img of images) {
            const key = img.imageUrl.split('/').slice(-1)[0];
            await s3.deleteObject({
                Bucket: process.env.AWS_S3_BUCKET_NAME,
                Key: key
            }).promise();
        }

        // Delete images from abTestImages collection
        await global.db.collection('abTestImages').deleteMany({ testId: testId });

        // Delete related entries from awsimages
        const awsKeys = images.map(img => img.imageUrl.split('/').slice(-1)[0]);
        await global.db.collection('awsimages').deleteMany({ key: { $in: awsKeys } });

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
    const { affiliateId, imageId } = req.query;

    if (!affiliateId || !imageId) {
        return res.status(400).json({ error: 'affiliateId and imageId parameters are required' });
    }

    try {
        // Validate affiliateId format
        if (!ObjectId.isValid(affiliateId)) {
            return res.status(400).json({ error: 'Invalid affiliateId format.' });
        }

        // Validate imageId existence
        const image = await global.db.collection('abTestImages').findOne({ imageId: imageId });
        if (!image) {
            return res.status(404).json({ error: 'Image not found.' });
        }

        // Get the current date in YYYY-MM-DD format
        const today = new Date().toISOString().split('T')[0];

        // Log the click event
        await global.db.collection('abTestClicks').insertOne({
            affiliateId: new ObjectId(affiliateId),
            imageId: imageId,
            testId: image.testId,
            date: today,
            timestamp: new Date(),
        });

        // Increment the click count in abTestImages
        await global.db.collection('abTestImages').updateOne(
            { imageId: imageId },
            { $inc: { clickCount: 1 } }
        );

        res.json({ message: 'Click event registered successfully' });
    } catch (error) {
        console.error('Failed to register click event:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Endpoint to register view event
router.get('/register-view', async (req, res) => {
    const { affiliateId, imageId } = req.query;

    if (!affiliateId || !imageId) {
        return res.status(400).json({ error: 'affiliateId and imageId parameters are required.' });
    }

    try {
        // Validate affiliateId format
        if (!ObjectId.isValid(affiliateId)) {
            return res.status(400).json({ error: 'Invalid affiliateId format.' });
        }

        // Validate imageId existence
        const image = await global.db.collection('abTestImages').findOne({ imageId: imageId });
        if (!image) {
            return res.status(404).json({ error: 'Image not found.' });
        }

        // Get the current date in YYYY-MM-DD format
        const today = new Date().toISOString().split('T')[0];

        // Log the view event
        await global.db.collection('abTestViews').insertOne({
            affiliateId: new ObjectId(affiliateId),
            imageId: imageId,
            testId: image.testId,
            date: today,
            timestamp: new Date(),
        });

        // Increment the view count in abTestImages
        await global.db.collection('abTestImages').updateOne(
            { imageId: imageId },
            { $inc: { viewCount: 1 } }
        );

        //console.log(`View registered for Image ID: ${imageId}, Variant: ${image.variant}, Test ID: ${image.testId}`);

        res.json({ message: 'View event registered successfully.' });
    } catch (error) {
        console.error('Failed to register view event:', error);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// Endpoint to get A/B test results (including tests with no data)
router.get('/get-ab-test-results', async (req, res) => {
    const { affiliateId } = req.query;

    try {
        // Define the date range (last 7 days)
        const today = new Date();
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(today.getDate() - 6); // Including today

        // Adjust start and end dates
        const startDate = new Date(sevenDaysAgo.setHours(0,0,0,0));
        const endDate = new Date(today.setHours(23,59,59,999));

        // Build the match stage
        let matchStage = {
            uploadDate: { $gte: startDate, $lte: endDate }
        };

        if (affiliateId) {
            // Validate affiliateId format
            if (!ObjectId.isValid(affiliateId)) {
                return res.status(400).json({ error: 'Invalid affiliateId format.' });
            }
            matchStage.affiliateId = new ObjectId(affiliateId);
        }

        // Aggregation pipeline
        const pipeline = [
            {
                $match: matchStage
            },
            {
                $group: {
                    _id: '$testId',
                    uploadDate: { $first: '$uploadDate' },
                    affiliateId: { $first: '$affiliateId' },
                    images: {
                        $push: {
                            imageId: '$imageId',
                            imageUrl: '$imageUrl',
                            imageName: '$imageName',
                            variant: '$variant',
                            targetUrl: '$targetUrl',
                            clickCount: '$clickCount',
                            viewCount: '$viewCount',
                            active: '$active'
                        }
                    }
                }
            },
            {
                $lookup: {
                    from: 'affiliate',
                    localField: 'affiliateId',
                    foreignField: '_id',
                    as: 'affiliateInfo'
                }
            },
            {
                $unwind: { 
                    path: '$affiliateInfo',
                    preserveNullAndEmptyArrays: true
                }
            },
            {
                $lookup: {
                    from: 'abTestClicks',
                    let: { testId: '$_id' },
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
                    let: { testId: '$_id' },
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
                    testId: '$_id',
                    totalClicks: { $ifNull: [{ $arrayElemAt: ['$clickData.totalClicks', 0] }, 0] },
                    totalViews: { $ifNull: [{ $arrayElemAt: ['$viewData.totalViews', 0] }, 0] },
                    affiliateName: { $ifNull: ['$affiliateInfo.name', 'N/A'] },
                    affiliateIdStr: { $cond: [{ $ifNull: ['$affiliateInfo._id', false] }, { $toString: '$affiliateInfo._id' }, 'N/A'] }
                }
            },
            {
                $project: {
                    _id: 0,
                    testId: 1,
                    uploadDate: 1,
                    images: 1,
                    affiliateName: 1,
                    affiliateIdStr: 1,
                    totalClicks: 1,
                    totalViews: 1
                }
            },
            {
                $sort: { uploadDate: -1 }
            }
        ];

        // Execute the aggregation pipeline
        const results = await global.db.collection('abTestImages').aggregate(pipeline).toArray();

        res.json(results);
    } catch (error) {
        console.error('Failed to get A/B test results:', error);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

module.exports = router;
