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
            const items = data[0]
            const user_id = data[1]
            const consolidated = consolidate_movement({
                'items' : items,
                'user_id' : user_id,
                'movement_label' : 'DEPOSIT'
            })
            if_location_exist({
                'location' : consolidated.location
            }).then(function (exists) {
                if (exists){
                    insert_stock({
                        'input' : consolidated.input
                    }).then(function (output) {
                        const res = {}
                        res["movement"] = consolidated.input
                        res["message"] = 'Item succesfully deposited'
                        resolve(res);
                    }).catch(function (err) {
                        reject(err);
                    })
                }
                else{
                    reject(new Error("Some location does not exist."));
                }
            }).catch(function (err) {
                reject(err);
            })
        })
    }

    module.withdraw = (data) => {
        return new Promise(function(resolve, reject) {
            const items = data[0]
            const user_id = data[1]
            const consolidated = consolidate_movement({
                'items' : items,
                'user_id' : user_id,
                'movement_label' : 'WITHDRAW'
            })
            if_location_exist({
                'location' : consolidated.location
            }).then(function (exists) {
                if (exists){
                    insert_stock({
                        'input' : consolidated.input
                    }).then(function (output) {
                        const res = {}
                        res["movement"] = consolidated.input
                        res["message"] = 'Item succesfully withdrawn'
                        resolve(res);
                    }).catch(function (err) {
                        reject(err);
                    })
                }
                else{
                    reject(new Error("Some location does not exist."));
                }
            }).catch(function (err) {
                reject(err);
            })
        })
    }

    function consolidate_movement(params) {
        const items = params.items
        const user_id = params.user_id
        const movement_label = params.movement_label
        const input = [];
        const location = [];
        items.forEach(element => {
            input.push([uuid.v4(), element.id, element.quantity, element.location_id, element.expiration_date, element.remarks, user_id, movement_label])
            if (location.indexOf(element.location_id) == -1){
                location.push(element.location_id)
            }
        });
        return {
            'input' : input,
            'location' : location
        }
    }

    function insert_stock(params) {
        return new Promise(function(resolve, reject) {
            const input = params.input
            mysql.use(db)
            .query(
                'INSERT INTO im_item_movement (id, item_id, quantity, location_id, expiration_date, remarks, user_id, type) VALUES ?',
                [input],
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
    }

    function if_location_exist(params) {
        return new Promise(function(resolve, reject) {
            const location = params.location
            mysql.use(db)
                .query(
                    'SELECT * from im_location WHERE id in (?)',
                    [location],
                    function(err1, res1) {
                        if (err1) {
                            reject(err1);
                        }

                        else {
                            if (location.length == res1.length){
                                resolve(true)
                            }
                            else{
                                resolve(false)
                            }
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
          location_id: '1',
          expiration_date: '', 
          remarks: 'test'},
        { id: '6abe0f64-e95d-11e8-9f32-f2801f1b9fd1',
          quantity: 10,
          location_id: '2',
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