FROM node:8.17.0

WORKDIR /app

COPY package*.json ./  
RUN npm install        

COPY . .             
RUN npm run build     

EXPOSE 8080

CMD ["npm", "start"]