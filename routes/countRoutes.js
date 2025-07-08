import { incrementCount, getCount } from '../controllers/countController.js';

const countRoutes = async (fastify, options) => {
    // Route to increment count
    fastify.post('/increment', {
        schema: {
            tags: ['Count'],
            summary: 'Increment visitor count',
            response: {
                200: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        currentCount: { type: 'number' }
                    }
                }
            }
        },
        handler: incrementCount
    });

    // Route to get current count
    fastify.get('/', {
        schema: {
            tags: ['Count'],
            summary: 'Get current visitor count',
            response: {
                200: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean' },
                        currentCount: { type: 'number' }
                    }
                }
            }
        },
        handler: getCount
    });
};

export default countRoutes;