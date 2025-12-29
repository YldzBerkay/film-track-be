import express, { Request, Response } from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { config } from './config/env';
import { connectDatabase } from './config/database';
import { errorHandler } from './middleware/error-handler';
import routes from './routes';
import subscriptionRoutes from './routes/subscription.routes';
import { socketService } from './services/socket.service';

const app = express();
const httpServer = createServer(app);

// Initialize Socket.io
socketService.initialize(httpServer);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.get('/', (req: Request, res: Response) => {
  res.json({
    message: 'CineTrack API is running!',
    version: '1.0.0'
  });
});

app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

// API Routes (aggregated)
app.use('/api', routes);
app.use('/api/subscription', subscriptionRoutes);

// Error handling middleware (must be last)
app.use(errorHandler);

// Connect to database and start server
const startServer = async (): Promise<void> => {
  try {
    await connectDatabase();

    httpServer.listen(config.port, () => {
      console.log(`🚀 Server is running on http://localhost:${config.port}`);
      console.log(`🔌 Socket.io is ready for connections`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

export default app;

