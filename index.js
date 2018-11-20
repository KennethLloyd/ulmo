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

    module.sample_method = () => {

    }

    module.sample_method2 = () => {
        
    }

    return module;
};
