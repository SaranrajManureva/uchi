/*Registration*/

var AWS = require('aws-sdk');
var mysql = require('mysql');
var crypto = require('crypto');
var sns = new AWS.SNS();
var connection;
var db_config = {};
function handleDisconnect() {
    connection = mysql.createConnection(db_config); // Recreate the connection, since
    // the old one cannot be reused.

    connection.connect(function (err) {              // The server is either down
        if (err) {                                     // or restarting (takes a while sometimes).
            console.log('error when connecting to db:', err);
            setTimeout(handleDisconnect, 2000); // We introduce a delay before attempting to reconnect,
        }                                     // to avoid a hot loop, and to allow our node script to
    });                                     // process asynchronous requests in the meantime.
    // If you're also serving http, display a 503 error.
    connection.on('error', function (err) {
        console.log('db error', err);
        if (err.code === 'PROTOCOL_CONNECTION_LOST') { // Connection to the MySQL server is usually
            handleDisconnect();                         // lost due to either server restart, or a
        } else {                                      // connnection idle timeout (the wait_timeout
            throw err;                                  // server variable configures this)
        }
    });
}

exports.connectWkDatabase = function (event, callback) {
    var hostName = event['stageVariables']['dbhost'];
    var userName = event['stageVariables']['dbusername'];
    var dbPassword = event['stageVariables']['dbpassword'];
    var databaseName = event['stageVariables']['dbname'];
    var dbPort = event['stageVariables']['dbport'];
    db_config = {
        host: hostName,
        user: userName,
        password: dbPassword,
        database: databaseName,
        port: dbPort,
        debug: false
    }

    connection = mysql.createConnection({
        host: hostName,
        user: userName,
        password: dbPassword,
        database: databaseName,
        port: dbPort,
        debug: false
    });
    connection.connect(function (err) {
        if (err) console.log(err);
        else {
            console.log('db connected');
        }
    });
    connection.on('error', function (err) {
        console.log('db error', err);
        if (err.code === 'PROTOCOL_CONNECTION_LOST') { // Connection to the MySQL server is usually
            handleDisconnect();                         // lost due to either server restart, or a
        } else {                                      // connnection idle timeout (the wait_timeout
            throw err;                                  // server variable configures this)
        }
    });
    callback({ 'status': 'OK' });
};


function convertStringtoObject(param) {
    if (param != '' && param != null ) {
        var x = param,
            y = {};
        x.split(',').map(function (i) {
            return i.split('~')
        }).forEach(function (j) {
            y[j[0].trim()] = j[1]
        });
        return y;

    }
    else {
        y = {
            "current": "",
            "master": ""
        };
        return y;
    }

}
 //userDetails
exports.userDetails = (result, event, callback) => {
    var sql = '';
    var response = {};
    var postData = JSON.parse(event['body']);
    //query to select user details based on email/social id
    sql = "CALL spRegistration('userId','" + result[0].userId + "','" + result[0].userId + "'," + postData['languageIdFk'] + ")";
    connection.query(sql, function (err, result) {
        if (err) {
            response = { // Bad Request
                "statusCode": 400,
                "body": JSON.stringify({ "statusCode": "1010", "sql": { sql } })
            }
            connection.end();
            callback(response);
        }
        else {
            result = result[0];
            if (result.length > 0) {
                if (result[0].userRegistrationStep == 'step3') {
                    for (var i in result) {
                        result[i]['userCity'] = convertStringtoObject(result[i]['userCity']);
                        result[i]['userCountry'] = convertStringtoObject(result[i]['userCountry']);
                        result[i]['userAddress'] = convertStringtoObject(result[i]['userAddress']);
                    }
                    response = {
                        "statusCode": 200,
                        "body": JSON.stringify({ "statusCode": "1013", "details": result[0] })
                    };
                    connection.end();
                    callback(response);
                }
                else {
                    var body = {
                        "statusCode": "1014",
                        "userId": result[0].userId,
                        "userLoginType": result[0].userLoginType,
                        "userRegistrationstatus": result[0].userRegistrationStep
                    };
                    response = {
                        "statusCode": 202,
                        "body": JSON.stringify(body)
                    };
                    connection.end();
                    callback(response);
                }
            }
            else {
                response = {
                    "statusCode": 404,
                    "body": JSON.stringify({ "statusCode": "1023" })
                };
                connection.end();
                callback(response);
            }

        }
    });

}

/*Registration step One */ 
exports.regStepOne = (postData, event, callback) => {
    var sql = '';
    var response = {};
   
    //query to select user details based on email/social id
    sql = "CALL spRegistration('" + postData['userLoginType'] + "','" + postData['userEmail'] + "','" + postData['userData'] + "'," + postData['languageIdFk'] + ")";

    connection.query(sql, function (err, result) {
        if (err) {
            response = { // Bad Request
                "statusCode": 400,
                "body": JSON.stringify({ "statusCode": "1010" })
            }
            connection.end();
            callback(response);
        }
        else { 
            result = result[0];
            if ((result.length > 0 && result[0].userPassword == crypto.createHash('md5').update(postData['userData']).digest('hex') && postData['userLoginType'] == 'Normal') || (result.length > 0 && postData['userLoginType'] != 'Normal') && result[0].userLoginType != null) { //Login success
                exports.userDetails(result, event, function (outputResponse) { //call the first step module
                    callback(outputResponse);
                });

            }
            else if (result.length > 0 && result[0].userPassword != crypto.createHash('md5').update(postData['userData']).digest('hex') && postData['userLoginType'] == 'Normal' && result[0].userLoginType == 'Normal') { // Authentication Fail
                console.log('fail');
                response = {
                    "statusCode": 401,
                    "body": JSON.stringify({ "statusCode": "1015" })
                };
                connection.end();
                callback(response);
            }
            else if (result.length > 0 && postData['userLoginType'] == 'Normal' && result[0].userLoginType != 'Normal' && result[0].userLoginType != '' && result[0].userLoginType != null) {//conflict
                var body = {
                    "statusCode": "1016",
                    "userId": result[0].userId,
                    "userLoginType": result[0].userLoginType,
                    "userRegistrationstatus": result[0].userRegistrationStep
                }
                response = {
                    "statusCode": 409,
                    "body": JSON.stringify(body)
                };
                connection.end();
                callback(response);
            }
            else if (postData['userLoginType'] == 'Normal') { // New insert in Normal
                sql = "INSERT INTO userDetails (userEmail, userPassword, userCreatedDate,userLoginType,userRoleIdFk,userRegistrationStep) VALUES ('" + postData['userEmail'] + "', '" + crypto.createHash('md5').update(postData['userData']).digest('hex') + "', now(),'" + postData['userLoginType'] + "','1','step1')";
                connection.query(sql, function (err, result) {
                    if (err) {
                        response = {  // Not inserted succesfully
                            "statusCode": 400,
                            "body": JSON.stringify({ "statusCode": "1004" })
                        };
                        connection.end();
                        callback(response);
                    }
                    else {
                        var body = {
                            "statusCode": "1003",
                            "userId": result.insertId,
                            "userLoginType": postData['userLoginType'],
                            "userRegistrationStep": "step1"
                        }
                        response = {
                            "statusCode": 201,
                            "body": JSON.stringify(body)
                        };
                        connection.end();
                        callback(response);
                    }

                });


            }
            else if (postData['userLoginType'] != 'Normal') {
                // New insert in social
                sql = "CALL spRegistration('Normal','" + postData['userEmail'] + "','" + postData['userData'] + "'," + postData['languageIdFk'] + ")";
                connection.query(sql, function (err, result) {
                    if (err) {
                        response = { // Bad Request
                            "statusCode": 400,
                            "body": JSON.stringify({ "statusCode": "1010" })
                        }
                        connection.end();
                        callback(response);
                    }
                    else {
                        result = result[0];
                        if (result.length > 0) {
                            body = {
                                "statusCode": "1016",
                                "userId": result[0].userId,
                                "userLoginType": result[0].userLoginType,
                                "userRegistrationstatus": result[0].userRegistrationStep
                            }

                            response = { //conflict
                                "statusCode": 409,
                                "body": JSON.stringify(body)
                            }
                            connection.end();
                            callback(response);

                        }
                        else {

                            sql = "INSERT INTO userDetails (userEmail," + postData['userLoginType'] + ", userCreatedDate,userLoginType,userRoleIdFk,userRegistrationStep,userUniqueId) VALUES ('" + postData['userEmail'] + "', '" + postData['userData'] + "', now(),'" + postData['userLoginType'] + "','1','step1','" + postData['userData'] + "')";
                            connection.query(sql, function (err, result) {
                                if (err) {
                                    response = {  // Not inserted succesfully
                                        "statusCode": 400,
                                        "body": JSON.stringify({ "statusCode": "1004" })
                                    };
                                    connection.end();
                                    callback(response);
                                }
                                else {
                                    var body = {
                                        "statusCode": "1003",
                                        "userId": result.insertId,
                                        "userLoginType": postData['userLoginType'],
                                        "userRegistrationStep": "step1"
                                    }
                                    response = {
                                        "statusCode": 201,
                                        "body": JSON.stringify(body)
                                    };
                                    connection.end();
                                    callback(response);
                                }

                            });

                        }


                    }
                });


            }
            else {
                response = {
                    "statusCode": 400,
                    "body": JSON.stringify({ "statusCode": "1010" })
                }
                connection.end();
                callback(response);
            }
        }
    });

   
};

/*Registration step two send OTP */
exports.regStepTwo = (event, callback) => {
    var sql = '';
    var response = {};
    var postData = JSON.parse(event['body']);
    sql = "SELECT userId,userLoginType,userRegistrationStep from userDetails WHERE userMobile='" + postData['userMobile'] + "'";
    exports.connectWkDatabase(event, function (res) {
    });
    connection.query(sql, function (err, result) {
        if (err) {
            response = {  // Bad request
                "statusCode": 400,
                "body": JSON.stringify({ "statusCode": "1010" })
            }
            connection.end();
            callback(response);
        }
        else {
            if ((result.length > 0 && result[0].userId == postData['userId']) || (result.length == 0)) {
                var mobilecode = Math.floor(Math.random() * 10000);
                sql = "UPDATE userDetails set userMobile = '" + postData['userMobile'] + "' , userMobileCode = '" + mobilecode + "'  WHERE userId = '" + postData['userId'] + "'";
                connection.query(sql, function (err, upresult) {
                    if (err) {
                        response = {  // Bad request
                            "statusCode": 400,
                            "body": JSON.stringify({ "statusCode": "1010" })
                        }
                        connection.end();
                        callback(response);
                    }
                    else {
                        var params = {
                            Message: 'Your One time Password is ' + mobilecode,
                            MessageStructure: 'string',
                            PhoneNumber: '+91' + postData['userMobile']
                        };
                        if (upresult.affectedRows > 0) {
                            sns.publish(params, function (err, data) {
                                if (err) {
                                    response = {  // Fail to send sms
                                        "statusCode": 400,
                                        "body": JSON.stringify({ "statusCode": "1019" })
                                    }
                                    connection.end();
                                    callback(response);
                                }
                                else {         //OTP sent successfully
                                    var body = {  
                                        "statusCode": "1020",
                                        "userId": result[0].userId,
                                        "userLoginType": result[0].userLoginType,
                                        "userRegistrationStep": result[0].userRegistrationStep
                                    }
                                    response = {  
                                        "statusCode": 200,
                                        "body": JSON.stringify(body)
                                    }
                                    connection.end();
                                    callback(response);
                                };
                            });
                        }
                        else {
                            response = {  // ID not found
                                "statusCode": 404,
                                "body": JSON.stringify({ "statusCode": "1002" })
                            }
                            connection.end();
                            callback(response);
                        }
                    }
                });
            }
            else {
                response = {  // Mobile number conflict
                    "statusCode": 409,
                    "body": JSON.stringify({ "statusCode": "1018" })
                }
                connection.end();
                callback(response);
            }
        }
    });
};

/*Registration OTP validation */
exports.regOtpVal = (event, callback) => {
    var sql = '';
    var response = {};
    var postData = JSON.parse(event['body']);

    sql = "SELECT userId,userMobileCode,userLoginType from userDetails WHERE userId='" + postData['userId'] + "'";
    exports.connectWkDatabase(event, function (res) {
    });
    connection.query(sql, function (err, result) {
        if (err) {
            response = {  // Bad request
                "statusCode": 400,
                "body": JSON.stringify({ "statusCode": "1010" })
            }
            connection.end();
            callback(response);
        }
        else { 
            if (result.length > 0 && result[0].userMobileCode == postData['userMobileCode']) { //valid otp

                sql = "UPDATE userDetails set  userRegistrationStep = 'step2'  WHERE userId = '" + postData['userId'] + "'";

                connection.query(sql, function (err, res) {
                    if (err) {
                        response = {  // Bad request
                            "statusCode": 400,
                            "body": JSON.stringify({ "statusCode": "1010" })
                        }
                        connection.end();
                        callback(response);
                    }
                    else {
                        if (res.affectedRows > 0) {
                            var body = {
                                "statusCode": "1022",
                                "userId": postData['userId'],
                                "userLoginType": result[0].userLoginType,
                                "userRegistrationStep": "step2"
                            }
                            response = {  // update the status
                                "statusCode": 200,
                                "body": JSON.stringify(body)
                            }
                            connection.end();
                            callback(response);
                        }
                        else {
                            response = {  // ID not found
                                "statusCode": 404,
                                "body": JSON.stringify({ "statusCode": "1002" })
                            }
                            connection.end();
                            callback(response);
                        }

                    }
                });
            }
            else if (result.length > 0 && result[0].userMobileCode != postData['userMobileCode']) { //invalid otp fail
                response = {
                    "statusCode": 401,
                    "body": JSON.stringify({ "statusCode": "1021" })
                }
                connection.end();
                callback(response);
            }
            else if (result.length == 0) {
                response = {  // ID not found
                    "statusCode": 404,
                    "body": JSON.stringify({ "statusCode": "1002" })
                }
                connection.end();
                callback(response);
            }
        }
    });
};

/*Registration step three*/
exports.regStepThree = (event, callback) => {
    var sql = '';
    var response = {};
    var postData = JSON.parse(event['body']);
    sql = "UPDATE userDetails set userLastName = '" + postData['userLastName'] + "' , userFirstName = '" + postData['userFirstName'] + "', userPostalCode = '" + postData['userPostalCode'] + "' , userRegistrationStep ='step3'  WHERE userId = '" + postData['userId'] + "'";

    connection.query(sql, function (err, res) {
        if (err) {
            response = {  // Bad request
                "statusCode": 400,
                "body": JSON.stringify({ "statusCode": "1010" })
            }
            connection.end();
            callback(response);
        }
        else {
            if (res.affectedRows > 0) {
                sql = "INSERT INTO userDetailsTrans (userIdFk, userAddress, userCity, userCountry, languageIdFk) VALUES ('" + postData['userId'] + "', '" + postData['userAddress'] + "', '" + postData['userCity'] + "','" + postData['userCountry'] + "','" + postData['languageIdFk'] + "')";

                connection.query(sql, function (err, res) {
                    if (err) {
                        response = {  // Bad request
                            "statusCode": 400,
                            "body": JSON.stringify({ "statusCode": "1010" })
                        }
                        connection.end();
                        callback(response);
                    }
                    else {
                        /*Logged In details*/
                        var body = {
                            "statusCode": "1013",
                            "userId": postData['userId'],
                            "userLoginType": res,
                            "userRegistrationStep": "step3"
                        }
                        response = {  // update the status
                            "statusCode": 200,
                            "body": JSON.stringify(body)
                        }
                        connection.end();
                        callback(response);
                    }
                });

            }
            else {
                response = {  // user not exist
                    "statusCode": 404,
                    "body": JSON.stringify({ "statusCode": "1002" })
                }
                connection.end();
                callback(response);
            }
        }
    });

};

exports.handler = function (event, context, callback) {
    var response = {};
    var postData = JSON.parse(event['body']); 
    var convert = '';
    var httpMethod = event['httpMethod']; 
   
 
    if (httpMethod == 'POST') { 
        if (postData.length == 0 || postData['userEmail'] == undefined || postData['userData'] == undefined || postData['userLoginType'] == undefined || postData['languageIdFk'] == undefined) {
            //check the parameters
            response = {
                "statusCode": 400,
                "body": JSON.stringify({ "statusCode": "1008"})
            }
            callback(null, response);
        }
        else if (postData['userEmail'] == '' || postData['userData'] == '' || postData['userLoginType'] == '' || postData['languageIdFk'] == '') {
            //validate values
            response = {
                "statusCode": 400,
                "body": JSON.stringify({ "statusCode": "1011" })
            }
            callback(null, response);
        }
        else if (postData['userLoginType'] != 'Normal' && postData['userLoginType'] != 'userGplusUniqueId' && postData['userLoginType'] != 'userTwitterUniqueId' && postData['userLoginType'] != 'userFbUniqueId') {
            //valid input
            response = {
                "statusCode": 400,
                "body": JSON.stringify({ "statusCode": "1012" })
            }
            callback(null, response);
        }
        else if (postData['languageIdFk'] != '') {
            //valid language
            exports.connectWkDatabase(event, function (res) {
            });
            var sql = "SELECT * FROM languageMaster where languageId='" + postData['languageIdFk'] + "'";
            connection.query(sql, function (err, result) {
                if (err) {
                    response = {
                        "statusCode": 400,
                        "body": JSON.stringify({ "statusCode": "1010" })
                    }
                    connection.end();
                    callback(null, response);
                }
                else { 
                    if (result.length > 0) {
                        exports.regStepOne(postData, event, function (outputResponse) { //call the first step module
                            callback(null, outputResponse);
                        }); 
                    }
                    else {
                        response = {
                            "statusCode": 400,
                            "body": JSON.stringify({ "statusCode": "1009" })
                        }
                        connection.end();
                        callback(null, response);
                    }
                }
            });

        }
    }  

    if (httpMethod == 'PATCH') {
        if (Object.keys(postData).length == 0 || postData['userMobile'] == undefined || postData['userId'] == undefined) {
            //validate params
            response = {
                "statusCode": 400,
                "body": JSON.stringify({ "statusCode": "1008"})
            }
            callback(null, response);
        }
        else if (postData['userMobile'] == '' || postData['userId'] == '') {
            //validate values
            response = {
                "statusCode": 400,
                "body": JSON.stringify({ "statusCode": "1011" })
            }
            callback(null, response);
        }
        else {
            exports.regStepTwo(event, function (outputResponse) { //call the second step module
                callback(null, outputResponse);
            });
        }
    }
    if (httpMethod == 'PUT') {
        if (Object.keys(postData).length === 0 || postData['action'] == undefined) {
            //validate params
            response = {
                "statusCode": 400,
                "body": JSON.stringify({ "statusCode": "1008" })
            }
            callback(null, response);
        }
        else if (postData['action'] == '') {
            //validate values
            response = {
                "statusCode": 400,
                "body": JSON.stringify({ "statusCode": "1011" })
            }
            callback(null, response);
        }
        else if (postData['action'] == 'etape2') {
            if (postData['userMobileCode'] == undefined || postData['userId'] == undefined) {
                //validate params
                response = {
                    "statusCode": 400,
                    "body": JSON.stringify({ "statusCode": "1008" })
                }
                callback(null, response);
            }
            else if (postData['userMobileCode'] == '' || postData['userId'] == '') {
                //validate values
                response = {
                    "statusCode": 400,
                    "body": JSON.stringify({ "statusCode": "1011" })
                }
                callback(null, response);
            }
            else {
                exports.regOtpVal(event, function (outputResponse) { //call the OTP validation step module
                    callback(null, outputResponse);
                });

            }

        }
        else if (postData['action'] == 'etape3') {
            if (postData['userLastName'] == undefined || postData['userFirstName'] == undefined || postData['userAddress'] == undefined || postData['userCity'] == undefined || postData['userPostalCode'] == undefined || postData['userCountry'] == undefined || postData['userId'] == undefined || postData['languageIdFk'] == undefined) {
                //validate params
                response = {
                    "statusCode": 400,
                    "body": JSON.stringify({ "statusCode": "1008" })
                }
                callback(null, response);
            }
            else if (postData['userLastName'] == '' || postData['userFirstName'] == '' || postData['userAddress'] == '' || postData['userCity'] == '' || postData['userPostalCode'] == '' || postData['userCountry'] == '' || postData['userId'] == '' || postData['languageIdFk'] == '') {
                //validate values
                response = {
                    "statusCode": 400,
                    "body": JSON.stringify({ "statusCode": "1011" })
                }
                callback(null, response);
            }
            else if (postData['languageIdFk'] != '') {
                //valid language
                exports.connectWkDatabase(event, function (res) {
                });
                var sql = "SELECT * FROM languageMaster where languageId='" + postData['languageIdFk'] + "'";
                connection.query(sql, function (err, result) {
                    if (err) {
                        response = {
                            "statusCode": 400,
                            "body": JSON.stringify({ "statusCode": "1010" })
                        }
                        connection.end();
                        callback(null, response);
                    }
                    else {
                        if (result.length > 0) {
                            exports.regStepThree(event, function (outputResponse) { //call the final step module
                                callback(null, outputResponse);
                            });
                        }
                        else {
                            response = {
                                "statusCode": 400,
                                "body": JSON.stringify({ "statusCode": "1009" })
                            }
                            connection.end();
                            callback(null, response);
                        }
                    }
                });

            }
        }
        else {
            //Not a valide input
            response = {
                "statusCode": 400,
                "body": JSON.stringify({ "statusCode": "1012" })
            }
            callback(null, response);
        }



    }
}
