import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'AI 选股助手 API',
      version: '1.0.0',
      description: 'A 股 AI 选股决策后端 API 文档，集成 DeepSeek 模型进行量化分析。',
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: '本地开发服务器',
      },
    ],
  },
  apis: ['./src/routes/*.ts'], // 指向包含注解的路由文件
};

export const swaggerSpec = swaggerJsdoc(options);
