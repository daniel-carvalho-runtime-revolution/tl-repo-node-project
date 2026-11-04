FROM node:18-bullseye

ENV NODE_ENV=development \
    JWT_SECRET=secret123 \
    ADMIN_API_KEY=vs_live_AdminKey_0000FAKE_TRAINING_0000

RUN apt-get update && apt-get install -y --no-install-recommends \
      iputils-ping curl netcat-traditional sudo procps vim \
    && rm -rf /var/lib/apt/lists/*

# "script de limpeza" precisa de find como root
RUN echo 'node ALL=(root) NOPASSWD: /usr/bin/find' > /etc/sudoers.d/node-cleanup \
    && chmod 440 /etc/sudoers.d/node-cleanup \
    && echo 'root:toor' | chpasswd

RUN echo 'FLAG{you_got_code_execution_as_node}' > /home/node/user-flag.txt \
    && chown node:node /home/node/user-flag.txt \
    && echo 'FLAG{root_via_sudo_find_gtfobins}' > /root/root-flag.txt \
    && chmod 600 /root/root-flag.txt

WORKDIR /app
COPY . .
RUN npm install && chown -R node:node /app && chmod -R 777 /app/public/uploads

USER node
EXPOSE 3000
CMD ["node", "src/server.js"]
