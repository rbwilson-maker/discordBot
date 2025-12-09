Author: Rachel Wilson (with contributions from ChatGPT and ClaudeCode)
Date: 12/8/2025

# Discord Bot Features

- Test Command: A simple command to test the bot's responsiveness.
- Create Trip Thread: Allows users to create a dedicated thread for trip planning.
- Add Trip Details: Users can add specific details to their trip threads.
- Log Spending: A feature to log expenses related to trips.
- Settle Thread: A command to finalize and close trip threads.
- Add Movie: Sends the form to add movies to a watchlist.

# How to Use
The bot must be running on a server in order for it to respond in discord.
```
npm run start
ngrok http 3000
```
starts the bot and the ngrok tunnel.

Ask Rachel for the `.env` file it uses values from her discord dev account.

After adding a new command, run the following command and restart the bot and discord client.
```
npm run register
```

# Trip Threads

For managing the trip thread, it uses a sort of local storage which resets after the bot is restarted.
Thus there is a function for reading and re-constructing the thread state from the messages in the thread.

The pinned message at the top of the channel sort of acts as the "database" for the trip thread.
