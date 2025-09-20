import { Hono } from 'hono';
import auth from './auth';
import library from './library';
import lessons from './lessons';
import readingSession from './reading-session';
import achievements from './achievements';
import vocabulary from './vocabulary';
import upload from './upload';
import lesson from './chat/lesson';
import speakingPractice from './chat/speaking-practice';
import { jwtMiddleware } from './utils/jwt';

const app = new Hono();

app.get('/api/health', (c: any) => c.json({ status: 'ok', cloudflare: true }));
app.route('/api/auth', auth);

// Protected routes
app.use('/api/library/*', jwtMiddleware);
app.use('/api/lessons/*', jwtMiddleware);
app.use('/api/reading-session/*', jwtMiddleware);
app.use('/api/achievements/*', jwtMiddleware);
app.use('/api/vocabulary/*', jwtMiddleware);
app.use('/api/upload/*', jwtMiddleware);
app.use('/api/chat/lesson/*', jwtMiddleware);
app.use('/api/chat/speaking-practice/*', jwtMiddleware);

app.route('/api/library', library);
app.route('/api/lessons', lessons);
app.route('/api/reading-session', readingSession);
app.route('/api/achievements', achievements);
app.route('/api/vocabulary', vocabulary);
app.route('/api/upload', upload);
app.route('/api/chat/lesson', lesson);
app.route('/api/chat/speaking-practice', speakingPractice);

export default app;
