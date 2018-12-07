'use strict'

const mysql             = require('anytv-node-mysql');
const config            = require(__dirname + '/config/config');
const promise           = require('promise');
const async     = require('async');

mysql.add('jeeves_db', config.JEEVES_DB);

module.exports = function(db_name) {
    var module = {};
    var db = db_name;
    var item_config = config[db_name + "_item_config"];
    var user_config = config[db_name + "_user_config"];
    
    module.run_sample = () => {
        return new Promise(function(resolve, reject) {
            mysql.use(db)
            .query(
                'SELECT * FROM ' + item_config.item_table + ' WHERE ' + item_config.item_id + ' = ?;',
                [1],
                function(err1, res1) {
                    if (err1) {
                        reject(err1);
                    }

                    else {
                        resolve(res1);
                    }
                }
            )
            .end();
        })
    };



    module.item_movement_history = (data) => {
        return new Promise(function(resolve, reject) {

            let datum = data[0];            

            let transactions = [];

            function getHeaders(cb){

                let qry         = 'SELECT id, created, user_id, type';
                let count       = 'SELECT count(id)';
                let from        = ' FROM im_movement_transaction WHERE user_id IN ('+mysql.escape(datum.user_id)+') ';
                let transaction_id = ' AND transaction_id LIKE '+mysql.escape('%'+datum.type+'%');
                let type        = ' AND type = '+mysql.escape(datum.type);
                let daterange   = ' AND (created BETWEEN '+mysql.escape(datum.from)+' AND DATE_ADD('+mysql.escape(datum.to)+',INTERVAL 1 DAY))';
                let limit       = ' LIMIT '+datum.page+','+datum.limit;

                if(!datum.transaction_id && !datum.type && !datum.daterange){
                    qry += ',('+count+from+') AS "total"';
                    qry += from;
                }

                if(datum.transaction_id && !datum.type && !datum.daterange){
                    qry += ',('+count+from+transaction_id+') AS "total"';
                    qry += from+transaction_id;
                }

                if(!datum.transaction_id && datum.type && !datum.daterange){
                    qry += ',('+count+from+type+') AS "total"';
                    qry += from+type;
                }

                if(!datum.transaction_id && !datum.type && datum.daterange){
                    qry += ',('+count+from+daterange+') AS "total"';
                    qry += from+daterange;
                }

                if(datum.transaction_id && datum.type && !datum.daterange){
                    qry += ',('+count+from+transaction_id+type+') AS "total"';
                    qry += from+transaction_id+type;
                }

                if(!datum.transaction_id && datum.type && datum.daterange){
                    qry += ',('+count+from+daterange+type+') AS "total"';
                    qry += from+daterange+type;
                }

                if(datum.transaction_id && !datum.type && datum.daterange){
                    qry += ',('+count+from+daterange+transaction_id+') AS "total"';
                    qry += from+daterange+transaction_id;
                }

                if(datum.transaction_id && datum.type && datum.daterange){
                    qry += ',('+count+from+daterange+transaction_id+type+') AS "total"';
                    qry += from+daterange+transaction_id+type;
                }


                let finalqry = qry+limit;   
                
                mysql.use(db)
                .query(
                    finalqry,
                    function(err, result, args, last_query){
                        if (err) {
                            reject(err);
                        }

                        if(result.length==0){
                            resolve({total:0, transactions:[]})
                        }else{         
                            for(let i=0; i<result.length; i++){
                                let transaction = {
                                    id      : result[i].id,
                                    created : result[i].created,
                                    user_id : result[i].user_id,
                                    type    : result[i].type                                    
                                }
                                transactions.push(transaction)
                                if(i==result.length-1){           
                                    return cb(null, [true,result[0].total])
                                }
                            }
                            
                        }
                    }
                ).end()
            }


            function getItems(cb){

                let counter = 0;
                
                for(let i=0; i<transactions.length; i++){
                    mysql.use(db)
                    .query(
                        'SELECT * FROM im_item_movement WHERE transaction_id = ?',
                        transactions[i].id,
                        function(err, result, args, last_query){
                            if (err) {
                                reject(err);
                            }
                            
                            transactions[i].items=[];

                            for(let a=0; a<result.length; a++){
                                transactions[i].items.push({
                                    id              : result[a].id,
                                    transaction_id  : result[a].transaction_id,
                                    item_id         : result[a].item_id,
                                    quantity        : result[a].quantity,
                                    location_id     : result[a].location_id,
                                    expiration_date : result[a].expiration_date,
                                    remarks         : result[a].remarks,
                                    type            : result[a].type,                                    
                                    user_id         : result[a].user_id,
                                    created         : result[a].created,
                                    updated         : result[a].updated,
                                    deleted         : result[a].deleted
                                });

                                if(a == result.length-1){
                                    counter++;
                                }

                            }
                            
                            if(counter == transactions.length){
                                return cb(null, true)
                            }
                        }
                    ).end()

                }

            }
            

            async.series([getHeaders,getItems], (err, results) => {
                if (err) {
                    reject(err);
                }
                
                if(results[0][0] == true && results[1] == true){    
                    resolve([{total: results[0][1]},transactions]);
                }
            
            })


        })
    
    }


    return module;
};