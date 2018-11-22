'use strict'

const mysql             = require('anytv-node-mysql');
const config            = require(__dirname + '/config/config');
const promise           = require('promise');
const uuid              = require('uuid');

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

    module.deposit = (items, user_id) => {
        return new Promise(function(resolve, reject) {
            const data = [];
            items.forEach(element => {
                data.push(uuid.v4(), element.id, element.quantity, element.location_id, element.expiration_date, element.remarks, user_id, "DEPOSIT")
            });
            mysql.use(db)
            .query(
                'INSERT INTO im_item_movement (id, item_id, quantity, location_id, expiration_date, remarks, user_id, type) VALUES (?)',
                data,
                function(err1, res1) {
                    if (err1) {
                        reject(err1);
                    }

                    else {
                        const res = {}
                        res["movement"] = data
                        res["message"] = 'Item succesfully deposited'
                        resolve(res);
                    }
                }
            )
            .end();
        })
    }

    module.withdraw = (items, user_id) => {
        return new Promise(function(resolve, reject) {
            const data = [];
            items.forEach(element => {
                data.push(uuid.v4(), element.id, element.quantity, element.location_id, element.expiration_date, element.remarks, user_id, "WITHDRAW")
            });
            mysql.use(db)
            .query(
                'INSERT INTO im_item_movement (id, item_id, quantity, location_id, expiration_date, remarks, user_id, type) VALUES (?)',
                data,
                function(err1, res1) {
                    if (err1) {
                        reject(err1);
                    }

                    else {
                        const res = {}
                        res["movement"] = data
                        res["message"] = 'Item succesfully withdrawn'
                        resolve(res);
                    }
                }
            )
            .end();
        })
    }

    return module;
};