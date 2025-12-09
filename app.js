import 'dotenv/config';
import express from 'express';
import {
  InteractionResponseFlags,
  InteractionResponseType,
  InteractionType,
  MessageComponentTypes,
  verifyKeyMiddleware,
} from 'discord-interactions';
import { getRandomEmoji, DiscordRequest } from './utils.js';

// Create an express app
const app = express();
// Get port, or default to 3000
const PORT = process.env.PORT || 3000;
// To keep track of trip threads and their data
const tripThreads = {};

/**
 * Helper function to create trip info message component
 */
function createTripInfoMessage(threadId, tripData = {}) {
  const lodgingAddress = tripData.lodgingAddress || '<update>';
  const startDate = tripData.startDate || '<update>';
  const endDate = tripData.endDate || '<update>';
  const alfredoSpending = (tripData.spending?.alfredo || 0).toFixed(2);
  const rachelSpending = (tripData.spending?.rachel || 0).toFixed(2);
  const notes = tripData.notes || '<update>';

  return {
    components: [
      {
        type: MessageComponentTypes.TEXT_DISPLAY,
        content: `## Trip Information\n\n**Lodging Address:** ${lodgingAddress}\n**Trip Dates:** ${startDate} - ${endDate}\n--------------\n**Alfredo's Spending:** $${alfredoSpending}\n**Rachel's Spending:** $${rachelSpending}\n--------------\n**Notes:**\n${notes}`,
      },
    ],
  };
}

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

    if (name === 'create-trip-thread') {
        const threadName = req.body.data.options[0].value;
        const guildId = req.body.guild_id;

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

            // Create a message in the new thread with trip info skeleton
            const messageEndpoint = `channels/${thread.id}/messages`;
            // Initialize trip data storage for this thread
            tripThreads[thread.id] = {
                messageId: null,
                tripData: {
                    spending: { alfredo: 0, rachel: 0 }
                },
            };

            const messageBody = {
                flags: InteractionResponseFlags.IS_COMPONENTS_V2,
                ...createTripInfoMessage(thread.id),
            };
            const messageRes = await DiscordRequest(messageEndpoint, { method: 'POST', body: messageBody });
            const message = await messageRes.json();

            // Store the message ID for later updates
            tripThreads[thread.id].messageId = message.id;

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

    // "update-trip-info" command
    if (name === 'update-trip-info') {
        const channelId = req.body.channel_id;

        // Check if this channel is a tracked trip thread
        if (!tripThreads[channelId]) {
            return res.send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    flags: InteractionResponseFlags.EPHEMERAL | InteractionResponseFlags.IS_COMPONENTS_V2,
                    components: [
                        {
                            type: MessageComponentTypes.TEXT_DISPLAY,
                            content: 'This command can only be used in a trip thread created with /create-trip-thread.',
                        },
                    ],
                },
            });
        }

        // Get the field to update and the value
        const options = req.body.data.options;
        const field = options[0].value; // 'lodging_address', 'start_date', 'end_date', or 'notes'
        const value = options[1].value;

        // Update the trip data
        const threadData = tripThreads[channelId];
        if (field === 'lodging_address') {
            threadData.tripData.lodgingAddress = value;
        } else if (field === 'start_date') {
            threadData.tripData.startDate = value;
        } else if (field === 'end_date') {
            threadData.tripData.endDate = value;
        } else if (field === 'notes') {
            // Append to existing notes with a newline
            if (threadData.tripData.notes && threadData.tripData.notes !== '<update>') {
                threadData.tripData.notes += '\n' + value;
            } else {
                threadData.tripData.notes = value;
            }
        }

        // Update the pinned message
        try {
            const updateEndpoint = `channels/${channelId}/messages/${threadData.messageId}`;
            await DiscordRequest(updateEndpoint, {
                method: 'PATCH',
                body: {
                    flags: InteractionResponseFlags.IS_COMPONENTS_V2,
                    ...createTripInfoMessage(channelId, threadData.tripData),
                },
            });

            return res.send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    flags: InteractionResponseFlags.EPHEMERAL | InteractionResponseFlags.IS_COMPONENTS_V2,
                    components: [
                        {
                            type: MessageComponentTypes.TEXT_DISPLAY,
                            content: `Trip information updated successfully!`,
                        },
                    ],
                },
            });
        } catch (err) {
            console.error('Error updating trip info:', err);
            return res.send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    flags: InteractionResponseFlags.EPHEMERAL | InteractionResponseFlags.IS_COMPONENTS_V2,
                    components: [
                        {
                            type: MessageComponentTypes.TEXT_DISPLAY,
                            content: `Failed to update trip information: ${err.message}`,
                        },
                    ],
                },
            });
        }
    }

    if (name === 'log-spending') {
        const channelId = req.body.channel_id;

        // Check if command is used in a trip thread
        if (!tripThreads[channelId]) {
            return res.send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    flags: InteractionResponseFlags.EPHEMERAL | InteractionResponseFlags.IS_COMPONENTS_V2,
                    components: [
                        {
                            type: MessageComponentTypes.TEXT_DISPLAY,
                            content: 'This command can only be used in a trip thread created with /create-trip-thread.',
                        },
                    ],
                },
            });
        }

        // Extract options
        const options = req.body.data.options;
        const person = options[0].value;  // 'alfredo' or 'rachel'
        const amountStr = options[1].value.trim();  // Get string value

        // Parse the amount - handle both comma and period as decimal separators
        const normalizedAmount = amountStr.replace(',', '.');
        const amount = parseFloat(normalizedAmount);

        // Additional validation for amount
        if (isNaN(amount) || amount <= 0) {
            return res.send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    flags: InteractionResponseFlags.EPHEMERAL | InteractionResponseFlags.IS_COMPONENTS_V2,
                    components: [
                        {
                            type: MessageComponentTypes.TEXT_DISPLAY,
                            content: `Invalid amount. Please enter a positive number (e.g., 25.50). You entered: "${amountStr}"`,
                        },
                    ],
                },
            });
        }

        // Update spending data
        const threadData = tripThreads[channelId];

        // Initialize spending object if it doesn't exist (for backward compatibility)
        if (!threadData.tripData.spending) {
            threadData.tripData.spending = { alfredo: 0, rachel: 0 };
        }

        // Ensure existing value is a number, then add the new amount
        const currentAmount = parseFloat(threadData.tripData.spending[person]) || 0;
        threadData.tripData.spending[person] = currentAmount + amount;

        // Update the pinned message
        try {
            const updateEndpoint = `channels/${channelId}/messages/${threadData.messageId}`;
            await DiscordRequest(updateEndpoint, {
                method: 'PATCH',
                body: {
                    flags: InteractionResponseFlags.IS_COMPONENTS_V2,
                    ...createTripInfoMessage(channelId, threadData.tripData),
                },
            });

            // Send confirmation message
            const personName = person.charAt(0).toUpperCase() + person.slice(1);
            const formattedAmount = amount.toFixed(2);

            return res.send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    flags: InteractionResponseFlags.EPHEMERAL | InteractionResponseFlags.IS_COMPONENTS_V2,
                    components: [
                        {
                            type: MessageComponentTypes.TEXT_DISPLAY,
                            content: `Added $${formattedAmount} to ${personName}'s spending. New total: $${threadData.tripData.spending[person].toFixed(2)}`,
                        },
                    ],
                },
            });
        } catch (err) {
            console.error('Error updating spending:', err);
            return res.send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    flags: InteractionResponseFlags.EPHEMERAL | InteractionResponseFlags.IS_COMPONENTS_V2,
                    components: [
                        {
                            type: MessageComponentTypes.TEXT_DISPLAY,
                            content: `Failed to update spending: ${err.message}`,
                        },
                    ],
                },
            });
        }
    }

    if (name === 'settle-thread') {
        // calculate who owes who and how much, then close the thread
        const channelId = req.body.channel_id;

        // Check if command is used in a trip thread
        if (!tripThreads[channelId]) {
            return res.send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    flags: InteractionResponseFlags.EPHEMERAL | InteractionResponseFlags.IS_COMPONENTS_V2,
                    components: [
                        {
                            type: MessageComponentTypes.TEXT_DISPLAY,
                            content: 'This command can only be used in a trip thread created with /create-trip-thread.',
                        },
                    ],
                },
            });
        }

        const threadData = tripThreads[channelId];
        const alfredoTotal = parseFloat(threadData.tripData.spending?.alfredo) || 0;
        const rachelTotal = parseFloat(threadData.tripData.spending?.rachel) || 0;
        const totalSpent = alfredoTotal + rachelTotal;
        const splitAmount = totalSpent / 2;

        let settlementMessage = '';
        if (alfredoTotal > splitAmount) {
            const amountOwed = (alfredoTotal - splitAmount).toFixed(2);
            settlementMessage = `Rachel owes Alfredo $${amountOwed} to settle up.`;
        } else if (rachelTotal > splitAmount) {
            const amountOwed = (rachelTotal - splitAmount).toFixed(2);
            settlementMessage = `Alfredo owes Rachel $${amountOwed} to settle up.`;
        } else {
            settlementMessage = 'Alfredo and Rachel are even. No one owes anything.';
        }

        // Respond to interaction first, then close the thread and send message to plans
        try {
            // Get thread information to find parent channel
            const threadInfoEndpoint = `channels/${channelId}`;
            const threadInfoRes = await DiscordRequest(threadInfoEndpoint, { method: 'GET' });
            const threadInfo = await threadInfoRes.json();
            const parentChannelId = threadInfo.parent_id;
            const threadName = threadInfo.name;

            // Send ephemeral confirmation to user
            res.send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    flags: InteractionResponseFlags.EPHEMERAL | InteractionResponseFlags.IS_COMPONENTS_V2,
                    components: [
                        {
                            type: MessageComponentTypes.TEXT_DISPLAY,
                            content: 'Thread settled and archived! Settlement posted to plans channel.',
                        },
                    ],
                },
            });

            // Send settlement message to the parent channel
            const messageEndpoint = `channels/${parentChannelId}/messages`;
            const messageBody = {
                flags: InteractionResponseFlags.IS_COMPONENTS_V2,
                components: [
                    {
                        type: MessageComponentTypes.TEXT_DISPLAY,
                        content: `## Trip Settled: ${threadName}\n\n${settlementMessage}\n\n**Total Spent:** $${totalSpent.toFixed(2)}\n**Alfredo's Total:** $${alfredoTotal.toFixed(2)}\n**Rachel's Total:** $${rachelTotal.toFixed(2)}`,
                    },
                ],
            };
            DiscordRequest(messageEndpoint, { method: 'POST', body: messageBody }).catch(err => {
                console.error('Error posting settlement message:', err);
            });

            // Archive the thread after responding (don't await this)
            const closeEndpoint = `channels/${channelId}`;
            DiscordRequest(closeEndpoint, {
                method: 'PATCH',
                body: { archived: true },
            }).catch(err => {
                console.error('Error archiving thread:', err);
            });

            // Must return to prevent falling through to the error handler at the end
            return;

        } catch (err) {
            console.error('Error settling thread:', err);
            return res.send({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    flags: InteractionResponseFlags.EPHEMERAL | InteractionResponseFlags.IS_COMPONENTS_V2,
                    components: [
                        {
                            type: MessageComponentTypes.TEXT_DISPLAY,
                            content: `Failed to settle thread: ${err.message}`,
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
    // No message component handlers currently implemented
    return;
  }


  console.error('unknown interaction type', type);
  return res.status(400).json({ error: 'unknown interaction type' });
});

app.listen(PORT, () => {
  console.log('Listening on port', PORT);
});