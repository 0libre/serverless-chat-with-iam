const AWS = require('aws-sdk');
const DocumentClient = new AWS.DynamoDB.DocumentClient({ apiVersion: '2012-08-10' });
const { TABLE_NAME } = process.env;

exports.handler = async event => {
  let connectionData;
  
  try {
    connectionData = await DocumentClient.scan({ TableName: TABLE_NAME }).promise();
  } catch (e) {
    return { statusCode: 500, body: e.stack };
  }
  
  const apigwManagementApi = new AWS.ApiGatewayManagementApi({
    apiVersion: '2018-11-29',
    endpoint: `${event.requestContext.domainName}/${event.requestContext.stage}`
  });
  
  const { message, userName, uuid } = JSON.parse(event.body);
  const Data = JSON.stringify({userName, message, uuid, timeStamp: new Date().getTime()})

  const postCalls = connectionData.Items.map(async ({ connectionId }) => {
    try {
      await apigwManagementApi.postToConnection({ ConnectionId: connectionId, Data }).promise();
    } catch (e) {
      if (e.statusCode === 410) {
        console.log(`Found stale connection, deleting ${connectionId}`);
        await DocumentClient.delete({ TableName: TABLE_NAME, Key: { connectionId } }).promise();
      } else {
        throw e;
      }
    }
  });
  
  try {
    await Promise.all(postCalls);
  } catch (e) {
    return { statusCode: 500, body: e.stack };
  }

  return { statusCode: 200, body: 'Data sent.' };
};
