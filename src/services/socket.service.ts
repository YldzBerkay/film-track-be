import { Server as SocketServer, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import jwt from 'jsonwebtoken';
import Redis from 'ioredis';

class SocketService {
    private io: SocketServer | null = null;
    private userSockets: Map<string, string> = new Map(); // userId -> socketId
    private publisher: Redis | null = null;
    private subscriber: Redis | null = null;
    private readonly CHANNEL = 'socket:emit';

    constructor() {
        // Initialize Redis clients for Pub/Sub
        const redisConfig = {
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379'),
            password: process.env.REDIS_PASSWORD || undefined
        };

        this.publisher = new Redis(redisConfig);
        this.subscriber = new Redis(redisConfig);
    }

    initialize(httpServer: HttpServer): void {
        this.io = new SocketServer(httpServer, {
            cors: {
                origin: ['http://localhost:4200', 'http://localhost:3000'],
                methods: ['GET', 'POST'],
                credentials: true
            }
        });

        // Subscribe to cross-process events
        this.subscriber?.subscribe(this.CHANNEL);
        this.subscriber?.on('message', (channel, message) => {
            if (channel === this.CHANNEL && this.io) {
                try {
                    const { userId, event, data } = JSON.parse(message);
                    this.io.to(`user:${userId}`).emit(event, data);
                    // console.log(`[SocketService] Relayed event '${event}' to user ${userId} via Redis`);
                } catch (err) {
                    console.error('[SocketService] Failed to parse Redis message:', err);
                }
            }
        });

        this.io.on('connection', (socket: Socket) => {
            console.log('Client connected:', socket.id);

            // Authenticate user from token
            const token = socket.handshake.auth.token;
            if (token) {
                try {
                    const jwtSecret = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
                    const decoded = jwt.verify(token, jwtSecret) as { userId: string };
                    const userId = decoded.userId;

                    // Map user to socket
                    this.userSockets.set(userId, socket.id);
                    socket.data.userId = userId;
                    console.log(`User ${userId} connected with socket ${socket.id}`);

                    // Join user-specific room
                    socket.join(`user:${userId}`);
                } catch (error) {
                    console.log('Invalid token in socket connection');
                }
            }

            socket.on('disconnect', () => {
                const userId = socket.data.userId;
                if (userId) {
                    this.userSockets.delete(userId);
                    console.log(`User ${userId} disconnected`);
                }
            });
        });

        console.log('Socket.io initialized');
    }

    /**
     * Emit event to a specific user
     * Supports cross-process emission via Redis
     */
    emitToUser(userId: string, event: string, data: any): void {
        if (this.io) {
            // Direct emit if IO is initialized (Main Process)
            this.io.to(`user:${userId}`).emit(event, data);
        } else {
            // Publish to Redis if IO is not initialized (Worker Process)
            console.log(`[SocketService] Publishing event '${event}' to Redis for user ${userId}`);
            this.publisher?.publish(this.CHANNEL, JSON.stringify({ userId, event, data }));
        }
    }

    /**
     * Get the Socket.io server instance
     */
    getIO(): SocketServer | null {
        return this.io;
    }
}

// Export singleton instance
export const socketService = new SocketService();
