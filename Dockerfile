FROM node:20-alpine
WORKDIR /app

# Install python3 and virtual environment for FastAPI backend
RUN apk add --no-cache python3 py3-pip && \
    python3 -m venv /venv && \
    /venv/bin/pip install --no-cache-dir fastapi uvicorn pydantic sqlalchemy bcrypt

ENV PATH="/venv/bin:$PATH"

COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
EXPOSE 3000
ENV NODE_ENV=production
CMD ["npm", "start"]
