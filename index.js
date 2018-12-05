'use strict'

const mysql             = require('anytv-node-mysql');
const config            = require(__dirname + '/config/config');
const promise           = require('promise');
const winston           = require('winston');
const async             = require("async");
const uuid              = require("uuid");


mysql.add('jeeves_db', config.JEEVES_DB);

module.exports = function(db_name) {
    var module = {};
    var db = db_name;
    var item_config = config[db_name + "_item_config"];
    var user_config = config[db_name + "_user_config"];

    module.deposit = (data) => {
        return new Promise(function(resolve, reject) {
    
            const datum = data[0];
    
            function check_location(cb){

                let noLocation = 0;
    
                for(let i=0; i<datum.items.length; i++){
                    mysql.use(db)
                        .query(
                            'SELECT id FROM im_location WHERE id = ? AND deleted IS NULL',
                            [datum.items[i].location_id],
                            function(error, result) {
                                if(error) {
                                    reject(error);
                                }else{
                                    if(result.length==0){
                                        noLocation = 1;                                        
                                    }else{
                                        datum.items[i].id = uuid.v4();
                                        datum.items[i].user_id = datum.user_id;
                                        datum.items[i].type = "DEPOSIT"
    
                                        if(datum.items[i].expiration_date == undefined){
                                            datum.items[i].expiration_date = null
                                        }
    
                                        if(datum.items[i].remarks == undefined){
                                            datum.items[i].remarks = null
                                        } 
                                    }

                                    if(i == datum.items.length-1 && noLocation == 0){
                                        return cb(null,true);
                                    }else if(i == datum.items.length-1 && noLocation == 1){
                                        return cb(null,false);
                                    }
                                }
                            }
                        ).end();
                }
    
            }
    
            async.series([check_location], (err, results) => {
                if (err) {
                    return next(err);
                }
    
                if(results[0]==false){
                    reject("Location not found no items were saved");
                }
                
                if(results[0]==true){
                    const transaction_id = uuid.v4();

                    mysql.use(db)
                        .query(
                            'INSERT INTO im_movement_transaction (id, user_id, type) VALUES (?,?,"DEPOSIT")',
                            [transaction_id,datum.user_id],
                            function(err,res){
                                if (err) {
                                    reject(err);
                                }else{
                                    for(let i=0; i<datum.items.length; i++){
                                        mysql.use(db)
                                        .query(
                                            'INSERT INTO im_item_movement (id, item_id, quantity, location_id, expiration_date, remarks, user_id, type,transaction_id) VALUES (?,?,?,?,?,?,?,?,?)',
                                            [datum.items[i].id, datum.items[i].item_id, datum.items[i].quantity, datum.items[i].location_id, datum.items[i].expiration_date, datum.items[i].remarks, datum.items[i].user_id, datum.items[i].type,transaction_id],
                                            function(err1, res1) {
                                                if (err1) {
                                                    reject(err1);
                                                }else {
                                                    if(i == datum.items.length-1){
                
                                                        resolve([datum.items, {message: "Items successfully deposited", transaction_id: transaction_id}]);
                                                    }
                                                }
                                            }
                                        )
                                        .end();
                                    }
                                }
                            }
                        ).end()

    
                }
    
            })
    
    
        })
    }


    return module;
};

