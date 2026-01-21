import express from 'express';
import apiRouter from './routes/api';
import dotenv from 'dotenv';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './swagger';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Swagger 文档路由
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// 挂载 API 路由
app.use('/api', apiRouter);

app.get('/', (req, res) => {
  res.send('AI 选股 API 正在运行。文档: <a href="/api-docs">/api-docs</a>');
});

app.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`);
  console.log(`Swagger 文档: http://localhost:${PORT}/api-docs`);
  console.log(`测试端点: http://localhost:${PORT}/api/stock/diagnosis/000933.SZ`);
});
