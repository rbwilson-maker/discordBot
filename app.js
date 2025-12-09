import 'dotenv/config';
import express from 'express';
import {
  ButtonStyleTypes,
  InteractionResponseFlags,
  InteractionResponseType,
  InteractionType,
  MessageComponentTypes,
  verifyKeyMiddleware,
} from 'discord-interactions';
import { getRandomEmoji, DiscordRequest } from './utils.js';
import { getShuffledOptions, getResult } from './game.js';

// Create an express app
const app = express();
// Get port, or default to 3000
const PORT = process.env.PORT || 3000;
// To keep track of our active games
const activeGames = {};

/**
 * Interactions endpoint URL where Discord will send HTTP requests
 * Parse request body and verifies incoming requests using discord-interactions package
 */
app.post('/interactions', verifyKeyMiddleware(process.env.PUBLIC_KEY), async function (req, res) {
  // Interaction id, type and data
  const { id, type, data } = req.body;

  /**
   * Handle verification requests
   */
  if (type === InteractionType.PING) {
    return res.send({ type: InteractionResponseType.PONG });
  }

  /**
   * Handle slash command requests
   * See https://discord.com/developers/docs/interactions/application-commands#slash-commands
   */
  if (type === InteractionType.APPLICATION_COMMAND) {
    const { name } = data;

    // "test" command
    if (name === 'test') {
      // Send a message into the channel where command was triggered from
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          flags: InteractionResponseFlags.IS_COMPONENTS_V2,
          components: [
            {
              type: MessageComponentTypes.TEXT_DISPLAY,
              // Fetches a random emoji to send from a helper function
              content: `hello world ${getRandomEmoji()}`
            }
          ]
        },
      });
    }

    // "test2" command
    if (name === 'test2') {
      // Send a message into the channel where command was triggered from
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          flags: InteractionResponseFlags.IS_COMPONENTS_V2,
          components: [
            {
              type: MessageComponentTypes.TEXT_DISPLAY,
              // Fetches a random emoji to send from a helper function
              content: `hello mars ${getRandomEmoji()}`
            }
          ]
        },
      });
    }

    // "challenge" command
    if (name === 'challenge' && id) {
        // Interaction context
        const context = req.body.context;
        // User ID is in user field for (G)DMs, and member for servers
        const userId = context === 0 ? req.body.member.user.id : req.body.user.id;
        // User's object choice
        const objectName = req.body.data.options[0].value;

        // Create active game using message ID as the game ID
        activeGames[id] = {
            id: userId,
            objectName,
        };

        return res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
            flags: InteractionResponseFlags.IS_COMPONENTS_V2,
            components: [
                {
                type: MessageComponentTypes.TEXT_DISPLAY,
                // Fetches a random emoji to send from a helper function
                content: `Rock papers scissors challenge from <@${userId}>`,
                },
                {
                type: MessageComponentTypes.ACTION_ROW,
                components: [
                    {
                    type: MessageComponentTypes.BUTTON,
                    // Append the game ID to use later on
                    custom_id: `accept_button_${req.body.id}`,
                    label: 'Accept',
                    style: ButtonStyleTypes.PRIMARY,
                    },
                ],
                },
            ],
            },
        });
    }

    if (name === 'create-trip-thread') {
        const threadName = req.body.data.options[0].value;
        const guildId = req.body.guild_id;

        res.send({
            type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
        });

        try {
            // Get all channels in the server to find #plans
            const channelsEndpoint = `guilds/${guildId}/channels`;
            const channelsRes = await DiscordRequest(channelsEndpoint, { method: 'GET' });
            const channels = await channelsRes.json();

            // Find the #plans channel
            const plansChannel = channels.find(channel => channel.name === 'plans' && channel.type === 0);

            if (!plansChannel) {
                return res.send({
                    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                    data: {
                        flags: InteractionResponseFlags.EPHEMERAL | InteractionResponseFlags.IS_COMPONENTS_V2,
                        components: [
                            {
                                type: MessageComponentTypes.TEXT_DISPLAY,
                                content: 'Error: No #plans channel found in this server. Please create a text channel named "plans" first.',
                            },
                        ],
                    },
                });
            }

            // Create thread via Discord API in the #plans channel
            const endpoint = `channels/${plansChannel.id}/threads`;
            const body = {
                name: threadName,
                type: 11, // Type 11 is for public threads
                auto_archive_duration: 60, // Auto-archive after 10 days of inactivity
            };

            const threadRes = await DiscordRequest(endpoint, { method: 'POST', body });
            const thread = await threadRes.json();

            // Create a message in the new thread
            const messageEndpoint = `channels/${thread.id}/messages`;
            const messageBody = {
                content: `Welcome to the ${threadName} trip planning thread! 📍`,
            };
            const messageRes = await DiscordRequest(messageEndpoint, { method: 'POST', body: messageBody });
            const message = await messageRes.json();

            // Pin the message
            const pinEndpoint = `channels/${thread.id}/pins/${message.id}`;
            await DiscordRequest(pinEndpoint, { method: 'PUT' });

            return res.send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    flags: InteractionResponseFlags.IS_COMPONENTS_V2,
                    components: [
                        {
                            type: MessageComponentTypes.TEXT_DISPLAY,
                            content: `Thread "${threadName}" created! Join here: <#${thread.id}>`,
                        },
                    ],
                },
            });
        } catch (err) {
            console.error('Error creating thread:', err);
            return res.send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    flags: InteractionResponseFlags.EPHEMERAL | InteractionResponseFlags.IS_COMPONENTS_V2,
                    components: [
                        {
                            type: MessageComponentTypes.TEXT_DISPLAY,
                            content: `Failed to create thread: ${err.message}`,
                        },
                    ],
                },
            });
        }
    }

    console.error(`unknown command: ${name}`);
    return res.status(400).json({ error: 'unknown command' });
  }

  if (type === InteractionType.MESSAGE_COMPONENT) {
    // custom_id set in payload when sending message component
    const componentId = data.custom_id;

    if (componentId.startsWith('accept_button_')) {
        // get the associated game ID
        const gameId = componentId.replace('accept_button_', '');
        // Delete message with token in request body
        const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/${req.body.message.id}`;
        try {
        await res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
            // Indicates it'll be an ephemeral message
            flags: InteractionResponseFlags.EPHEMERAL | InteractionResponseFlags.IS_COMPONENTS_V2,
            components: [
                {
                type: MessageComponentTypes.TEXT_DISPLAY,
                content: 'What is your object of choice?',
                },
                {
                type: MessageComponentTypes.ACTION_ROW,
                components: [
                    {
                    type: MessageComponentTypes.STRING_SELECT,
                    // Append game ID
                    custom_id: `select_choice_${gameId}`,
                    options: getShuffledOptions(),
                    },
                ],
                },
            ],
            },
        });
        // Delete previous message
        await DiscordRequest(endpoint, { method: 'DELETE' });
        } catch (err) {
        console.error('Error sending message:', err);
        }
    } else if (componentId.startsWith('select_choice_')) {
        // get the associated game ID
        const gameId = componentId.replace('select_choice_', '');

        if (activeGames[gameId]) {
        // Interaction context
        const context = req.body.context;
        // Get user ID and object choice for responding user
        // User ID is in user field for (G)DMs, and member for servers
        const userId = context === 0 ? req.body.member.user.id : req.body.user.id;
        const objectName = data.values[0];
        // Calculate result from helper function
        const resultStr = getResult(activeGames[gameId], {
            id: userId,
            objectName,
        });

        // Remove game from storage
        delete activeGames[gameId];
        // Update message with token in request body
        const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/${req.body.message.id}`;

        try {
            // Send results
            await res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                flags: InteractionResponseFlags.IS_COMPONENTS_V2,
                components: [
                {
                    type: MessageComponentTypes.TEXT_DISPLAY,
                    content: resultStr
                }
                ]
                },
            });
            // Update ephemeral message
            await DiscordRequest(endpoint, {
            method: 'PATCH',
            body: {
                components: [
                {
                    type: MessageComponentTypes.TEXT_DISPLAY,
                    content: 'Nice choice ' + getRandomEmoji()
                }
                ],
            },
            });
        } catch (err) {
            console.error('Error sending message:', err);
        }
        }
    }

    return;
    }


  console.error('unknown interaction type', type);
  return res.status(400).json({ error: 'unknown interaction type' });
});

app.listen(PORT, () => {
  console.log('Listening on port', PORT);
});