import type { Server as SocketServer } from 'socket.io';

let ioRef: SocketServer | null = null;

export function setIo(io: SocketServer): void {
  ioRef = io;
}

export function emitToUser(userId: string, event: string, payload: unknown): void {
  ioRef?.to(`user:${userId}`).emit(event, payload);
}

export function emitToServer(serverId: string, event: string, payload: unknown): void {
  ioRef?.to(`server:${serverId}`).emit(event, payload);
}

export function emitToChannel(channelId: string, event: string, payload: unknown): void {
  ioRef?.to(`channel:${channelId}`).emit(event, payload);
}

export function emitToDm(dmChannelId: string, event: string, payload: unknown): void {
  ioRef?.to(`dm:${dmChannelId}`).emit(event, payload);
}

export function getIo(): SocketServer | null {
  return ioRef;
}
