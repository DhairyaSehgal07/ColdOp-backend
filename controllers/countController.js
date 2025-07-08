import Count from '../models/countModel.js';

export const incrementCount = async (request, reply) => {
    try {
        // Find the count document or create if it doesn't exist
        let countDoc = await Count.findOne();

        if (!countDoc) {
            countDoc = await Count.create({ count: 0 });
        }

        // Increment the count
        countDoc.count += 1;
        await countDoc.save();

        return reply.code(200).send({
            success: true,
            currentCount: countDoc.count
        });
    } catch (error) {
        return reply.code(500).send({
            success: false,
            message: 'Error incrementing count',
            error: error.message
        });
    }
};

export const getCount = async (request, reply) => {
    try {
        const countDoc = await Count.findOne();

        if (!countDoc) {
            return reply.code(200).send({
                success: true,
                currentCount: 0
            });
        }

        return reply.code(200).send({
            success: true,
            currentCount: countDoc.count
        });
    } catch (error) {
        return reply.code(500).send({
            success: false,
            message: 'Error getting count',
            error: error.message
        });
    }
};