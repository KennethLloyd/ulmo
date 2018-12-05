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

    module.transfer = (data) => {
        return new Promise(function(resolve, reject) {

            const datum     = data[0];
            let verified    = [];

            let noLocation  = 0;

            function check_location(cb){
    
                for(let i=0; i<datum.items.length; i++){
                    mysql.use(db)
                        .query(
                            'SELECT id FROM im_location WHERE id = ? AND deleted IS NULL',
                            [datum.items[i].source],
                            function(error, result) {
                                if(error) {
                                    reject(error);
                                }else{
                                    if(result.length==0){
                                        noLocation = 1;                                        
                                    }else{
                                       
                                        datum.items[i].user_id = datum.user_id;

                                        let itemOk = {
                                            item_id         : datum.items[i].item_id,
                                            quantity        : datum.items[i].quantity,
                                            id              : uuid.v4(),
                                            user_id         : datum.user_id,
                                            type            : "WITHDRAW",
                                            location_id     : datum.items[i].source
                                        }

    
                                        if(datum.items[i].expiration_date == undefined){
                                            itemOk.expiration_date = null
                                        }else{                                            
                                            itemOk.expiration_date = datum.items[i].expiration_date;          
                                        }
    
                                        if(datum.items[i].remarks == undefined){
                                            itemOk.remarks = null
                                        }else{                                                                                     
                                            itemOk.remarks = datum.items[i].remarks
                                        }
                                        
                                        verified.push(itemOk);
                                        
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

            function check_quantity(cb) {   
                
                if(noLocation == 1){
                    return cb(null,"nolocation");
                }else{                    
                
                let hasExceed           = 0;
                let hasZeroRemaining    = 0;
                let hasZeroUserInput    = 0;
                let counter             = 0;

                datum.items.forEach(function(item, i) {

                    let qry = '';

                        if(item.expiration_date){
                            qry = 'SELECT quantity, type FROM im_item_movement WHERE item_id = '+mysql.escape(item.item_id)+' AND location_id = '+mysql.escape(item.source)+' AND user_id ='+mysql.escape(item.user_id)+' AND expiration_date= '+mysql.escape(item.expiration_date)+' AND deleted IS NULL';
                        }else{
                            qry = 'SELECT quantity, type FROM im_item_movement WHERE item_id = '+mysql.escape(item.item_id)+' AND location_id = '+mysql.escape(item.source)+' AND user_id ='+mysql.escape(item.user_id)+' AND deleted IS NULL';
                        }
                        
                    if(parseFloat(item.quantity) <= 0){
                        hasZeroUserInput = 1;    
                    }else{
                        mysql.use(db)
                        .query(
                            qry,
                            function(error, result) {
                                if(error) {
                                    reject(error);
                                } else {
                                    if(result.length == 0){
                                        hasZeroUserInput = 1;
                                    }else{

                                        function getRemaining(cb2){

                                            let deposit     = 0;
                                            let withdraw    = 0;

                                            for(let a=0; a < result.length; a++) {
                                                if(result[a].type === "DEPOSIT") {
                                                    deposit += parseFloat(result[a].quantity)
                                                }else if(result[a].type === "WITHDRAW") {
                                                    withdraw += parseFloat(result[a].quantity)
                                                }
                                                
                                                if(a == result.length - 1) {
                                                    let remaining = parseFloat(deposit) - parseFloat(withdraw);
                                                    cb2(null, remaining)
                                                }
                                            }

                                        }

                                        async.series([getRemaining], (err, results) => {
                                            if (err) {
                                                reject(err)
                                            }

                                            let remainingbal = results[0];

                                            switch (true) {
                                                case (remainingbal <= 0)                          :   hasZeroRemaining = 1;
                                                                                                    break;                                                
                                                case (remainingbal < parseFloat(item.quantity))   :   hasExceed = 1;
                                                                                                    break;
                                                case (remainingbal >= parseFloat(item.quantity))  :   counter++;
                                                                                                    break;                                      
                                            }


                                            if(counter == datum.items.length && i == datum.items.length-1){                                                
                                                return cb(null,true);
                                            }else if (i == datum.items.length-1){
                                                switch(true){ 
                                                    case (hasExceed == 1)           : return cb(null, "exceed");
                                                    case (hasZeroRemaining == 1)    : return cb(null,false);
                                                    case (hasZeroUserInput == 1)    : return cb(null,false);   
                                                    default                         : return cb(null,false);
                                                }
                                            }                                           

                                        })

                                    }
                                }
                            }
                        ).end()
                    }
                    
                })

                }                
            }

    
            async.series([check_location, check_quantity], (err, results) => {
                if (err) {
                    reject(err)
                }
                
                if(results[0]==false || results[1]=="nolocation"){
                    reject("Location not found no items were saved");
                }

                if(results[1]==false){
                    reject("There is no quantity to withdraw");
                }

                if(results[1]==="exceed"){
                    reject("Quantity to withdraw is higher than the remaining balance");
                }

                
                if(results[0]==true && results[1]==true){                    
                    fordeposit();
                }
                
            })

            function fordeposit(){                    
                    
                    function check_location(cb){

                        let noLocation = 0;
            
                        for(let i=0; i<datum.items.length; i++){
                            mysql.use(db)
                                .query(
                                    'SELECT id FROM im_location WHERE id = ? AND deleted IS NULL',
                                    [datum.items[i].destination],
                                    function(error, result) {
                                        if(error) {
                                            reject(error);
                                        }else{
                                            if(result.length==0){
                                                noLocation = 1;                                        
                                            }else{
                                                /*datum.items[i].id = uuid.v4();
                                                datum.items[i].user_id = datum.user_id;
                                                datum.items[i].type = "DEPOSIT"
            
                                                if(datum.items[i].expiration_date == undefined){
                                                    datum.items[i].expiration_date = null
                                                }
            
                                                if(datum.items[i].remarks == undefined){
                                                    datum.items[i].remarks = null
                                                }*/

                                                let itemOk = {
                                                    item_id         : datum.items[i].item_id,
                                                    quantity        : datum.items[i].quantity,
                                                    id              : uuid.v4(),
                                                    user_id         : datum.user_id,
                                                    type            : "DEPOSIT",
                                                    location_id     : datum.items[i].destination
                                                }
        
            
                                                if(datum.items[i].expiration_date == undefined){
                                                    itemOk.expiration_date = null
                                                }else{                                            
                                                    itemOk.expiration_date = datum.items[i].expiration_date;          
                                                }
            
                                                if(datum.items[i].remarks == undefined){
                                                    itemOk.remarks = null
                                                }else{                                                                                     
                                                    itemOk.remarks = datum.items[i].remarks
                                                }
                                                
                                                verified.push(itemOk); 
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
                                    'INSERT INTO im_movement_transaction (id, user_id, type) VALUES (?,?,"TRANSFER")',
                                    [transaction_id,datum.user_id],
                                    function(err,res){
                                        if (err) {
                                            reject(err);
                                        }else{
                                            for(let i=0; i<verified.length; i++){
                                                mysql.use(db)
                                                .query(
                                                    'INSERT INTO im_item_movement (id, item_id, quantity, location_id, expiration_date, remarks, user_id, type,transaction_id) VALUES (?,?,?,?,?,?,?,?,?)',
                                                    [verified[i].id, verified[i].item_id, verified[i].quantity, verified[i].location_id, verified[i].expiration_date, verified[i].remarks, verified[i].user_id, verified[i].type,transaction_id],
                                                    function(err1, res1) {
                                                        if (err1) {
                                                            reject(err1);
                                                        }else {
                                                            if(i == verified.length-1){
                        
                                                                resolve([verified, {message: "Items successfully transferred", transaction_id: transaction_id}]);
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


                }
            
            
        })
  
    }


    return module;
};