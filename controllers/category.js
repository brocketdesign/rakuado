const { ObjectId } = require('mongodb');

module.exports = {
  // Add a new category to req.user.categories
  add: async function(req, res) {
    const categoryName = req.body.name;

    // Check if the category name already exists for the user
    const existingCategory = req.user.categories.find(cat => cat.name === categoryName);

    if (existingCategory) {
      return res.send({ message: 'カテゴリはすでに存在します！' }); // "Category Already Exists!"
    } 

    const newCategoryId = new ObjectId(); // Generate new ObjectId for category
    const newCategory = {
      id: newCategoryId.toHexString(),
      name: categoryName
    };

    // Push the new category to the user's categories array
    try {
      const result = await global.db.collection('users').updateOne(
        { _id: new ObjectId(req.user._id) },
        { $push: { categories: newCategory } }
      );

      if (result.modifiedCount > 0) {
        return res.send({ message: 'カテゴリを作成しました！' }); // "Category Created!"
      } else {
        return res.send({ message: 'カテゴリの作成に失敗しました。' }); // "Failed to create category."
      }
    } catch (err) {
      return res.status(400).send({ status: false, message: JSON.stringify(err) });
    }
  },

  // Update category name
  update: async function(req, res) {
    const categoryId = req.body.id;
    const newName = req.body.name;

    try {
      const result = await global.db.collection('users').updateOne(
        { _id: new ObjectId(req.user._id), "categories.id": categoryId },
        { $set: { "categories.$.name": newName } }
      );

      if (result.modifiedCount > 0) {
        return res.status(200).send({ status: true, message: 'カテゴリが更新されました！' }); // "Category Updated!"
      } else {
        return res.send({ message: 'カテゴリの更新に失敗しました。' }); // "Failed to update category."
      }
    } catch (err) {
      return res.status(400).send({ status: false, message: JSON.stringify(err) });
    }
  },

  // Delete category
  delete: async function(req, res) {
    const categoryId = req.body.id;

    try {
      const result = await global.db.collection('users').updateOne(
        { _id: new ObjectId(req.user._id) },
        { $pull: { categories: { id: categoryId } } }
      );

      if (result.modifiedCount > 0) {
        return res.send({ message: 'カテゴリが正常に削除されました。' }); // "Category successfully deleted."
      } else {
        return res.send({ message: 'カテゴリが存在しません。' }); // "Category does not exist."
      }
    } catch (err) {
      return res.status(400).send({ status: false, message: JSON.stringify(err) });
    }
  },

  // Get categories for the user
  get: async function(req, res) {
    try {
      const user = await global.db.collection('users').findOne({ _id: new ObjectId(req.user._id) });
      return res.send(user.categories);
    } catch (err) {
      return res.status(400).send({ status: false, message: JSON.stringify(err) });
    }
  }
}
