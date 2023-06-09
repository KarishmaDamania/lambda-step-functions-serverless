'use strict';
const AWS = require("aws-sdk");
const DynamoDB = require("aws-sdk/clients/dynamodb")
const StepFunction = new AWS.StepFunctions();
const DocumentClient = new DynamoDB.DocumentClient({region: 'us-east-1'})

const isBookAvailable = (book, quantity) => {
  return (book.quantity - quantity) > 0
}

const deductPoints = async (userId) => {
  let params = {
    TableName: 'userTable',
    Key: {'userId': userId},
    UpdateExpression: 'SET points = :zero',
    ExpressionAttributeValues: {
      ':zero': 0
    }
  }
  await DocumentClient.update(params).promise()
}


const updateBookQuantity = async (bookId, orderQuantity) => {
  console.log("bookId: ", bookId);
  console.log("orderQuantity: ", orderQuantity);
  let params = {
      TableName: 'bookTable',
      Key: { 'bookId': bookId },
      UpdateExpression: 'SET quantity = quantity - :orderQuantity',
      ExpressionAttributeValues: {
          ':orderQuantity': orderQuantity
      }
  };
  await DocumentClient.update(params).promise();
}

module.exports.checkInventory = async ({bookId, quantity}) => {
  try{
    console.log(bookId, quantity)
    let params = {
      TableName: 'bookTable',
      KeyConditionExpression: 'bookId = :bookId',
      ExpressionAttributeValues: {
        ':bookId': bookId
      }
    }

    let result = await DocumentClient.query(params).promise()
    let book = result.Items[0]

    if (isBookAvailable(book, quantity)){
      return book
    }
    else{
      let bookOutOfStockError = new Error("The Book is Out Of Stock")
      bookOutOfStockError.name = 'BookOutOfStock'
      throw bookOutOfStockError
    }

  }catch(err){
    if (err.name == "BookOutOfStock"){
      throw err
    }
    else{
      let bookNotFoundError = new Error(err)
      bookNotFoundError.name = "BookNotFound"
      throw bookNotFoundError
    }

  }

};

module.exports.calculateTotal = async ({book, quantity}) => {
  let total = book.price * quantity
  return {
    total
  }
};


module.exports.redeemPoints = async ({userId, total}) => {
  let orderTotal = total.total
  try {
    let params = {
      TableName: 'userTable',
      Key: {
        'userId': userId
      }
    }
    let result = await DocumentClient.get(params).promise()
    let user = result.Item

    const points = user.points
    if (orderTotal > points){
      await deductPoints(userId)
      orderTotal = orderTotal - points
      return {
        total: orderTotal,
        points
      }
    }
    else{
      throw new Error('Order total is less than redeem points')
    }

  }catch(err){
    throw new Error(err)
  }
};

module.exports.billCustomer = async (params) => {
  return "Successfully Billed"
};

module.exports.restoreRedeemPoints = async ({userId, total}) => {
  try{
    if (total.points){
      let params = {
        TableName: 'userTable',
        Key: {userId: userId},
        UpdateExpression: 'SET points = :points',
        ExpressionAttributeValues: {
          ':points': total.points
        }
      }
      await DocumentClient.update(params).promise()
    }
  }catch(err){
    throw new Error(err)
  }
};



module.exports.sqsWorker = async (event) => {
  try {
      console.log(JSON.stringify(event));
      let record = event.Records[0];
      var body = JSON.parse(record.body);
      /** Find a courier and attach courier information to the order */
      let courier = "starkarish@gmail.com";

      // update book quantity
      await updateBookQuantity(body.Input.bookId, body.Input.quantity);

     // throw "Something wrong with Courier API";

      // Attach curier information to the order
      await StepFunction.sendTaskSuccess({
          output: JSON.stringify({ courier }),
          taskToken: body.Token
      }).promise();
  } catch (e) {
      console.log("===== You got an Error =====");
      console.log(e);
      await StepFunction.sendTaskFailure({
          error: "NoCourierAvailable",
          cause: "No couriers are available",
          taskToken: body.Token
      }).promise();
  }
}

module.exports.restoreQuantity = async ({ bookId, quantity }) => {
  let params = {
      TableName: 'bookTable',
      Key: { bookId: bookId },
      UpdateExpression: 'set quantity = quantity + :orderQuantity',
      ExpressionAttributeValues: {
          ':orderQuantity': quantity
      }
  };
  await DocumentClient.update(params).promise();
  return "Quantity restored"
}