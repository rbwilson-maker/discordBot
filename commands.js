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

const ALL_COMMANDS = [TEST_COMMAND, MY_COMMAND, UPDATE_TRIP_INFO_COMMAND];

InstallGlobalCommands(process.env.APP_ID, ALL_COMMANDS);