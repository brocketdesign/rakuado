const { ObjectId } = require('mongodb');

module.exports = {

  // Add a new category ID to a media's categories array
  add: async function(req, res) {
    const mediaId = req.body.mediaId;
    const categoryId = req.body.categoryId;

    // Fetch the specific media based on mediaId
    const mediaElement = await global.db.collection('medias').findOne({ _id: new ObjectId(mediaId) });

    if (!mediaElement) {
      return res.send({ success:false, message: 'メディアが存在しません。' }); // "Media does not exist."
    }

    // Check if the category ID already exists for the media
    const existingCategoryId = mediaElement.categories && mediaElement.categories.includes(categoryId);

    if (existingCategoryId) {
      return res.send({ success:false, message: 'カテゴリはすでに存在します！' }); // "Category Already Exists!"
    }

    // Add the new category ID to the media's categories array
    try {
      const result = await global.db.collection('medias').updateOne(
        { _id: new ObjectId(mediaId) },
        { $push: { categories: new ObjectId(categoryId) } }
      );

      if (result.modifiedCount > 0) {
        return res.send({ success:true, message: 'カテゴリに追加しました' }); // "Category Added!"
      } else {
        return res.send({ success:false, message: 'カテゴリの作成に失敗しました。' }); // "Failed to add category."
      }
    } catch (err) {
      return res.status(400).send({ status: false, message: JSON.stringify(err) });
    }
  },

  // Delete a category ID from a media's categories array
  delete: async function(req, res) {
    const mediaId = req.body.mediaId;
    const categoryId = req.body.categoryId;

    try {
      const result = await global.db.collection('medias').updateOne(
        { _id: new ObjectId(mediaId) },
        { $pull: { categories: new ObjectId(categoryId) } }
      );

      if (result.modifiedCount > 0) {
        return res.send({ success:true, message: 'カテゴリが正常に削除されました。' }); // "Category successfully deleted."
      } else {
        return res.send({ success:false, message: 'カテゴリが存在しません。' }); // "Category does not exist."
      }
    } catch (err) {
      return res.status(400).send({ status: false, message: JSON.stringify(err) });
    }
  },
  
  // Remove all categories from a media's categories array
  deleteAll: async function(req, res) {
    const mediaId = req.body.mediaId;

    try {
      const result = await global.db.collection('medias').updateOne(
        { _id: new ObjectId(mediaId) },
        { $set: { categories: [] } }
      );

      if (result.modifiedCount > 0) {
        return res.send({ success:true, message: 'すべてのカテゴリが正常に削除されました。' }); // "All categories successfully deleted."
      } else {
        return res.send({ success:false, message: 'メディアが存在しません。' }); // "Media does not exist."
      }
    } catch (err) {
      return res.status(400).send({ success: false, message: JSON.stringify(err) });
    }
  },

  // Get categories IDs for a specific media
  get: async function(req, res) {
    const mediaId = req.body.mediaId;

    try {
      const mediaElement = await global.db.collection('medias').findOne({ _id: new ObjectId(mediaId) });
      if (!mediaElement) {
        return res.send({ success:false, message: 'メディアが存在しません。' }); // "Media does not exist."
      }
      return res.send(mediaElement.categories);
    } catch (err) {
      return res.status(400).send({ status: false, message: JSON.stringify(err) });
    }
  }
}
