# CineTrack Backend

Node.js backend API for CineTrack application.

## Tech Stack

- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **TypeScript** - Type safety
- **CORS** - Cross-origin resource sharing
- **dotenv** - Environment variables

## Getting Started

### Installation

```bash
npm install
```

### Development

Run the development server with hot reload:

```bash
npm run dev
```

The server will start on `http://localhost:3000` (or the port specified in `.env`).

### Build

Build the project for production:

```bash
npm run build
```

### Production

Run the production build:

```bash
npm start
```

## Project Structure

```
cinetrack-be/
├── src/
│   └── index.ts          # Main server file
├── dist/                 # Compiled JavaScript (generated)
├── node_modules/         # Dependencies
├── .env                  # Environment variables
├── .env.example          # Example environment variables
├── .gitignore
├── nodemon.json          # Nodemon configuration
├── package.json
├── tsconfig.json         # TypeScript configuration
└── README.md
```

## API Endpoints

- `GET /` - API status
- `GET /health` - Health check

## Environment Variables

Create a `.env` file in the root directory:

```
PORT=3000
NODE_ENV=development
```

