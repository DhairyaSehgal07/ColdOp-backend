# COLDOP BACKEND

## Description

A more detailed description of your project, its purpose, and the problem it solves.

## Installation

Instructions for installing and setting up your project locally.

### Prerequisites

- Node.js (20.17.0)
- [pnpm](https://pnpm.io) (9.9.0)

### Steps

1. Clone the repository:
   ```bash
   git clone https://github.com/DhairyaSehgal07/cold-op-backend
   ```
2. Navigate to the project directory:
   ```bash
   cd cold-op-backend
   ```
3. Install dependencies:
   ```bash
   pnpm install
   ```

## Usage

Instructions for running and using your project.

1. Start the server:
   ```bash
   pnpm start
   ```
2. Open your browser and navigate to `http://localhost:5000`

### API Endpoints

Describe the available endpoints, including their methods, paths, and expected inputs/outputs.

- **GET /api/example**

  - Description: Example endpoint
  - Query Parameters: None
  - Response: JSON object

  ## Configuration

  Explain any configuration options, environment variables, or settings.

Create a `.env` file in the root directory and add the following variables:
NODE_ENV = development
PORT = 5000
MONGO_URI= your_mongo_uri
JWT_SECRET= your_jwt_secret
TWILIO_ACCOUNT_SID= your_twilio_sid
TWILIO_AUTH_TOKEN = your_twilio_auth_token
TWILIO_PHONE_NUMBER=your_twilio_phone_number
DOMAIN = http://localhost:5000/api/farmers
STORE_ADMIN_DOMAIN=http:localhost:5000/api/store-admin
SESSION_SECRET = your_session_secret
CLOUDINARY_CLOUD_NAME = your_cloudinary_name
CLOUDINARY_API_KEY= your_cloudinary_api_key
CLOUDINARY_API_SECRET= your_cloudinary_api_secret

### 6. Contributing

```markdown
## Contributing

Guidelines for contributing to your project.

1. Fork the repository.
2. Create a new branch for your feature or bug fix.
3. Submit a pull request with a description of your changes.
```

## Acknowledgements

Thanks to my friends Gourish Narang and Anurag Anand who helped me
in building this project
