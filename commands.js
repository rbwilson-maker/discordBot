import 'dotenv/config';
import { InstallGlobalCommands } from './utils.js';

// Simple test command
const TEST_COMMAND = {
  name: 'test',
  description: 'Basic command',
  type: 1,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const MY_COMMAND = {
    name: 'create-trip-thread',
    type: 1,
    description: 'Create a thread for a trip',
    options: [
        {
            type: 3,
            name: 'thread-name',
            description: 'Name your thread',
            required: true,
        }
    ],
    integration_types: [0, 1],
    contexts: [0, 1, 2],
}

const UPDATE_TRIP_INFO_COMMAND = {
    name: 'update-trip-info',
    type: 1,
    description: 'Update trip information in the current trip thread',
    options: [
        {
            type: 3,
            name: 'field',
            description: 'Field to update',
            required: true,
            choices: [
                {
                    name: 'Lodging Address',
                    value: 'lodging_address',
                },
                {
                    name: 'Start Date',
                    value: 'start_date',
                },
                {
                    name: 'End Date',
                    value: 'end_date',
                },
                {
                    name: 'Notes',
                    value: 'notes',
                },
                {
                    name: "Alfredo's Spending",
                    value: 'alfredo_spending',
                },
                {
                    name: "Rachel's Spending",
                    value: 'rachel_spending',
                },
            ],
        },
        {
            type: 3,
            name: 'value',
            description: 'New value for the field',
            required: true,
        }
    ],
    integration_types: [0, 1],
    contexts: [0, 1, 2],
}

const LOG_SPENDING_COMMAND = {
    name: 'log-spending',
    type: 1,
    description: 'Log spending for a person on this trip',
    options: [
        {
            type: 3,
            name: 'person',
            description: 'Who is spending?',
            required: true,
            choices: [
                {
                    name: 'Alfredo',
                    value: 'alfredo',
                },
                {
                    name: 'Rachel',
                    value: 'rachel',
                },
            ],
        },
        {
            type: 3,
            name: 'amount',
            description: 'Amount spent (e.g., 25.50 or -10.00 to reduce)',
            required: true,
        },
        {
            type: 3,
            name: 'description',
            description: 'What was this expense for? (e.g., hotel, food)',
            required: false,
        }
    ],
    integration_types: [0, 1],
    contexts: [0, 1, 2],
}

const SETTLE_THREAD_COMMAND = {
    name: 'settle-thread',
    type: 1,
    description: 'Settle spending for the trip and close this thread',
    integration_types: [0, 1],
    contexts: [0, 1, 2],
}

const ALL_COMMANDS = [
  TEST_COMMAND, MY_COMMAND, 
  UPDATE_TRIP_INFO_COMMAND, 
  LOG_SPENDING_COMMAND, 
  SETTLE_THREAD_COMMAND
];

InstallGlobalCommands(process.env.APP_ID, ALL_COMMANDS);