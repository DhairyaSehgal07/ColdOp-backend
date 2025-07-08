import mongoose from 'mongoose';

const countSchema = new mongoose.Schema({
    count: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true
});

export default mongoose.model('Count', countSchema);