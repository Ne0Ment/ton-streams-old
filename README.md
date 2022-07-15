# ton-stream-bot
Telegram bot for ton-stream

On first setup run **npm install** and **npm install pm2** (in case you want a production launch) <br/>


To run for *production*
 - pm2 start dist/app.js -- -TELETOKEN (telegram token) --TONWEBTOKEN (tonwebtestnet token)

To stop on *production*
 - pm2 kill (Kill all pm2 processes, but there will only be one anyways)

Npm scripts:
 - **npm run dev** - start a nodemon instance to auto-build and launch on edits
 - **npm run build** - build src/app.ts to dist/app.js
 - **npm run start** - run dist/app.js
 
