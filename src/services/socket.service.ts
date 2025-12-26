import { Server as SocketServer, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import jwt from 'jsonwebtoken';

class SocketService {
    private io: SocketServer | null = null;
    private userSockets: Map<string, string> = new Map(); // userId -> socketId

    initialize(httpServer: HttpServer): void {
        this.io = new SocketServer(httpServer, {
            cors: {
                origin: ['http://localhost:4200', 'http://localhost:3000'],
                methods: ['GET', 'POST'],
                credentials: true
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
     */
    emitToUser(userId: string, event: string, data: any): void {
        if (!this.io) {
            console.warn('Socket.io not initialized');
            return;
        }

        this.io.to(`user:${userId}`).emit(event, data);
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
