const { UserModel } = require('./schemaLoader');

const createUser = async (userData) => {
    const user = new UserModel(userData);
    return await user.save();
};

const findUserById = async (id) => {
    return await UserModel.findOne({ _id: id });
};

const findUserByEmail = async (email) => {
    return await UserModel.findOne({
        email: email
    });
}

module.exports = {
    createUser,
    findUserById,
    findUserByEmail
};