'use strict'

const mysql             = require('anytv-node-mysql');
const config            = require(__dirname + '/config/config');
const promise           = require('promise');
const uuid              = require('uuid');

mysql.add('bgw73vdwex88xb6h', config.bgw73vdwex88xb6h_DB);

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

    module.deposit = (data) => {
        return new Promise(function(resolve, reject) {
            const input = [];
            const items = data[0]
            const user_id = data[1]
            items.forEach(element => {
                input.push([uuid.v4(), element.id, element.quantity, element.location_id, element.expiration_date, element.remarks, user_id, "DEPOSIT"])
            });
            mysql.use(db)
            .query(
                'INSERT INTO im_item_movement (id, item_id, quantity, location_id, expiration_date, remarks, user_id, type) VALUES ?',
                [input],
                function(err1, res1) {
                    if (err1) {
                        reject(err1);
                    }

                    else {
                        const res = {}
                        res["movement"] = input
                        res["message"] = 'Item succesfully deposited'
                        resolve(res);
                    }
                }
            )
            .end();
        })
    }

    module.withdraw = (data) => {
        return new Promise(function(resolve, reject) {
            const input = [];
            const items = data[0]
            const user_id = data[1]
            items.forEach(element => {
                input.push([uuid.v4(), element.id, element.quantity, element.location_id, element.expiration_date, element.remarks, user_id, "WITHDRAW"])
            });
            mysql.use(db)
            .query(
                'INSERT INTO im_item_movement (id, item_id, quantity, location_id, expiration_date, remarks, user_id, type) VALUES ?',
                [input],
                function(err1, res1) {
                    if (err1) {
                        reject(err1);
                    }

                    else {
                        const res = {}
                        res["movement"] = input
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

module.exports('bgw73vdwex88xb6h').withdraw([
    [
        { id: '6abe0f64-e95d-11e8-9f32-f2801f1b9fd1',
          quantity: 10,
          location_id: '06882ccc-e93b-11e8-9f32-f2801f1b9fd1',
          expiration_date: '', 
          remarks: 'test'},
        { id: '6abe0f64-e95d-11e8-9f32-f2801f1b9fd1',
          quantity: 10,
          location_id: '06882ccc-e93b-11e8-9f32-f2801f1b9fd1',
          expiration_date: '', 
          remarks : 'test2'}
    ],
    '3911bcca-e93c-11e8-9f32-f2801f1b9fd1'
]).then(function(response) {
    console.log(response)
})
.catch(function(err) {         
    console.log(err)
})