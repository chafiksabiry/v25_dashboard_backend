const mongoose = require('mongoose');

const gigSchema = new mongoose.Schema({
    title: {
        type: String,
        required: [true, 'Please add a title']
    },
    description: String,
    category: String,
    status: {
        type: String,
        default: 'active'
    }
}, { strict: false, timestamps: true });

const Gig = mongoose.model('Gig', gigSchema);

module.exports = { Gig };
