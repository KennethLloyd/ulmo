'use strict'

const mysql             = require('anytv-node-mysql');
const config            = require(__dirname + '/config/config');
const promise           = require('promise');

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

                let qry     = 'SELECT id, item_id, quantity, location_id, expiration_date, remarks, type';
                let count   = 'SELECT COUNT(id) ';
                let from    = ' FROM im_item_movement WHERE deleted IS NULL AND user_id = '+mysql.escape(datum.user_id);
                let where1  = ' AND location_id IN ('+mysql.escape(datum.location_id)+')';
                let where2  = ' AND item_id IN ('+mysql.escape(datum.item_id)+')';
                let limit   = ' LIMIT '+datum.page+','+datum.limit;

                if(!datum.location_id && !datum.item_id){
                    qry += ',('+count+from+') AS "total"';
                    qry += from;
                }

                if(datum.location_id && !datum.item_id){
                    qry += ',('+count+from+where1+') AS "total"';
                    qry += from+where1;
                }

                if(!datum.location_id && datum.item_id){
                    qry += ',('+count+from+where2+') AS "total"';
                    qry += from+where2;
                }

                if(datum.location_id && datum.item_id){
                    qry += ',('+count+from+where1+where2+') AS "total"';
                    qry += from+where1+where2;
                }

                let finalqry = qry+limit;        
                
                mysql.use(db)
                .query(
                    finalqry,
                    function(err, result, args, last_query){
                        if (err) {
                            reject(err);
                        }else if(result.length==0){
                            resolve({total:0, locations:[]});
                        }else{
                            
                            let total = result[0].total;
                            let items = [];
                            let i =0;                            
                            for(i=0; i<result.length;i++){

                                items.push({
                                    id              : result[i].id,
                                    item_id         : result[i].item_id, 
                                    quantity        : result[i].quantity,
                                    location_id     : result[i].location_id,
                                    expiration_date : result[i].expiration_date,
                                    remarks         : result[i].remarks,
                                    type            : result[i].type
                                });

                                if(i==result.length-1){                                    
                                    resolve({total:total, items:items});
                                }
                            }
                            
                        } 
                    }
                ).end();        

        })
    }


    return module;
};
