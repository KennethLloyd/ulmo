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

    module.get_current_inventory = (params) => {
        return new Promise(function(resolve, reject) {
            var response = [];
            var latest_balance = [];
            var pagination = null;
            var balance_date = null;

            let inventory = {};

            if (typeof params.search_item === 'undefined' || params.search_item === undefined) {
                params.search_item = '';
            }
            if (typeof params.is_breakdown === 'undefined' || params.is_breakdown === undefined) {
                params.is_breakdown = 1;
            }
            if (typeof params.is_grouped === 'undefined' || params.is_grouped === undefined) {
                params.is_grouped = 1;
            }

            pagination = "";
            

            get_latest_balance_header();

            function get_latest_balance_header() {
                mysql.use(db)
                    .query(
                        'SELECT * FROM im_balance_history WHERE deleted IS NULL ORDER BY created DESC LIMIT 1',
                        function(err, res) {
                            if (err) {
                                console.log(err);
                                reject(err);
                            }
                            else if (!res.length) { //no previous balance
                                latest_balance = [];
                                balance_date = "0000-00-00";
                                start();
                            }
                            else {
                                balance_date = format_date(res[0].created);
                                get_latest_balance_details(res[0].id);
                            }
                        }
                    )
            }

            function get_latest_balance_details(balance_id) {
                var details_params = {
                    balance_id: balance_id,
                    location_id: params.location_id,
                    item_id: params.item_id, 
                    search_item: params.search_item,
                    is_breakdown: params.is_breakdown,
                    is_grouped: params.is_grouped,
                    page: -1, //to remove pagination in get_inventory
                }

                module.get_inventory(details_params)
                    .then(function(response) {
                        latest_balance = response;
                        start();
                    })
                    .catch(function(err) {           
                        console.log(err);
                        reject(err);
                    })
            }

            function start() {
                if (params.is_breakdown == 1) { //default for specific locations
                    if (params.location_id.length === 0) {
                        mysql.use(db)
                        .query(
                            'SELECT l.id AS location_id, l.code AS location_code, l.name AS location_name FROM im_location l WHERE l.deleted IS NULL ORDER BY l.name',
                            function(err, res) {
                                if (err) {
                                    console.log(err);
                                    reject(err);
                                }
                                else {
                                    async.each(res, fetch_items_breakdown, send_response); //get items for each location
                                }
                            }
                        )
                    }
                    else {
                        mysql.use(db)
                        .query(
                            'SELECT l.id AS location_id, l.code AS location_code, l.name AS location_name FROM im_location l WHERE l.id IN (?) AND l.deleted IS NULL ORDER BY l.name',
                            [params.location_id],
                            function(err, res) {
                                if (err) {
                                    console.log(err);
                                    reject(err);
                                }
                                else {
                                    async.each(res, fetch_items_breakdown, send_response); //get items for each location
                                }
                            }
                        )
                    }
                }
                else {

                }
            }

            function fetch_items_breakdown(row, callback) {
                function send_callback(err, result) {
                    if (err) {
                        //winston.error('Error in retrieving current inventory', last_query);
                        console.log(err);
                        return callback(err);
                    }
                    row['items'] = result;
                    response.push(row);
                    return callback();
                }
                
                var deposited = [];
                var withdrawn = [];

                if (params.is_grouped == 1) {
                    var group_clause = "GROUP BY i." + item_config.item_id;
                    var exp_clause = "";
                }
                else {
                    var group_clause = "GROUP BY mv.item_id, mv.expiration_date";
                    var exp_clause = ", mv.expiration_date";
                }
                
                if (params.item_id.length === 0) { //all items
                    //STOCK = SUM(deposited) - SUM(withdrawn)
                    mysql.use(db)
                    .query(
                        'SELECT mv.item_id, i.' + item_config.item_sku + ' AS item_sku, i.' + item_config.item_name + ' AS item_name, SUM(mv.quantity) AS item_quantity' + exp_clause + ' FROM im_item_movement mv, ' + item_config.item_table + ' i WHERE mv.location_id = ? AND mv.item_id = i.' + item_config.item_id + ' AND mv.type = "DEPOSIT" AND (i.' + item_config.item_name + ' LIKE ? OR i.' + item_config.item_sku + ' LIKE ?) AND mv.created > ? AND mv.deleted IS NULL ' + group_clause + ' ORDER BY i.' + item_config.item_name + ' ' + pagination,
                        [row.location_id, "%"+params.search_item+"%", "%"+params.search_item+"%", balance_date],
                        function(err1, res1) {
                            if (!err1) {
                                deposited = res1;
                                mysql.use(db)
                                .query(
                                    'SELECT mv.item_id, i.' + item_config.item_sku + ' AS item_sku, i.' + item_config.item_name + ' AS item_name, SUM(mv.quantity) AS item_quantity' + exp_clause + ' FROM im_item_movement mv, ' + item_config.item_table + ' i WHERE mv.location_id = ? AND mv.item_id = i.' + item_config.item_id + ' AND mv.type = "WITHDRAW" AND (i.' + item_config.item_name + ' LIKE ? OR i.' + item_config.item_sku + ' LIKE ?) AND mv.created > ? AND mv.deleted IS NULL ' + group_clause + ' ORDER BY i.' + item_config.item_name + ' ' + pagination, 
                                    [row.location_id, "%"+params.search_item+"%", "%"+params.search_item+"%", balance_date],
                                    function(err2, res2) {
                                        if (!err2) {
                                            withdrawn = res2;
                                            if (params.is_grouped == 1) {
                                                for (var i=0;i<deposited.length;i++) {
                                                    for (var j=0;j<withdrawn.length;j++) {
                                                        if (deposited[i].item_id == withdrawn[j].item_id) {
                                                            deposited[i].item_quantity = (deposited[i].item_quantity - withdrawn[j].item_quantity);
                                                            break;
                                                        }
                                                    }
                                                }
                                            }
                                            else {
                                                for (var i=0;i<deposited.length;i++) {
                                                    for (var j=0;j<withdrawn.length;j++) {
                                                        if ((deposited[i].item_id == withdrawn[j].item_id) && (deposited[i].expiration_date == withdrawn[j].expiration_date)) {
                                                            deposited[i].item_quantity = (deposited[i].item_quantity - withdrawn[j].item_quantity);
                                                            break;
                                                        }
                                                    }
                                                }
                                            }
                                            send_callback(err2, deposited)
                                        }
                                        else {
                                            console.log(err2);
                                        }
                                    }
                                )
                            }
                            else {
                                console.log(err1);
                            }
                        }
                    )
                }
                else { //specific items
                    //STOCK = SUM(deposited) - SUM(withdrawn)
                    mysql.use(db)
                    .query(
                        'SELECT mv.item_id, i.' + item_config.item_sku + ' AS item_sku, i.' + item_config.item_name + ' AS item_name, SUM(mv.quantity) AS item_quantity' + exp_clause + ' FROM im_item_movement mv, ' + item_config.item_table + ' i WHERE mv.location_id = ? AND mv.item_id IN (?) AND mv.item_id = i.' + item_config.item_id + ' AND mv.type = "DEPOSIT" AND (i.' + item_config.item_name + ' LIKE ? OR i.' + item_config.item_sku + ' LIKE ?) AND mv.created > ? AND mv.deleted IS NULL ' + group_clause + ' ORDER BY i.' + item_config.item_name + ' ' + pagination, 
                        [row.location_id, params.item_id, "%"+params.search_item+"%", "%"+params.search_item+"%", balance_date],
                        function(err1, res1) {
                            if (!err1) {
                                deposited = res1;
                                mysql.use(db)
                                .query(
                                    'SELECT mv.item_id, i.' + item_config.item_sku + ' AS item_sku, i.' + item_config.item_name + ' AS item_name, SUM(mv.quantity) AS item_quantity' + exp_clause + ' FROM im_item_movement mv, ' + item_config.item_table + ' i WHERE mv.location_id = ? AND mv.item_id IN (?) AND mv.item_id = i.' + item_config.item_id + ' AND mv.type = "WITHDRAW" AND (i.' + item_config.item_name + ' LIKE ? OR i.' + item_config.item_sku + ' LIKE ?) AND mv.created > ? AND mv.deleted IS NULL ' + group_clause + ' ORDER BY i.' + item_config.item_name + ' ' + pagination, 
                                    [row.location_id, params.item_id, "%"+params.search_item+"%", "%"+params.search_item+"%", balance_date],
                                    function(err2, res2) {
                                        if (!err2) {
                                            withdrawn = res2;
                                            if (params.is_grouped == 1) {
                                                for (var i=0;i<deposited.length;i++) {
                                                    for (var j=0;j<withdrawn.length;j++) {
                                                        if (deposited[i].item_id == withdrawn[j].item_id) {
                                                            deposited[i].item_quantity = (deposited[i].item_quantity - withdrawn[j].item_quantity);
                                                            break;
                                                        }
                                                    }
                                                }
                                            }
                                            else {
                                                for (var i=0;i<deposited.length;i++) {
                                                    for (var j=0;j<withdrawn.length;j++) {
                                                        if ((deposited[i].item_id == withdrawn[j].item_id) && (deposited[i].expiration_date == withdrawn[j].expiration_date)) {
                                                            deposited[i].item_quantity = (deposited[i].item_quantity - withdrawn[j].item_quantity);
                                                            break;
                                                        }
                                                    }
                                                }
                                            }
                                            send_callback(err2, deposited)
                                        }
                                        else {
                                            console.log(err2);
                                        }
                                    }
                                )
                            }
                            else {
                                console.log(err1);
                            }
                        }
                    )
                }
            }

            function fetch_items_no_breakdown(row, callback) {
                function send_callback(err, result, args, last_query) {
                    if (err) {
                        console.log(err);
                        return callback(err);
                    }
                    row['items'] = result;
                    response.push(row);
                    return callback();
                }
                
                var deposited = [];
                var withdrawn = [];

                if (params.item_id.length === 0) { //all items
                    //STOCK = SUM(deposited) - SUM(withdrawn)
                    mysql.use(db)
                    .query(
                        'SELECT mv.item_id, i.' + item_config.item_sku + ' AS item_sku, i.' + item_config.item_name + ' AS item_name, SUM(mv.quantity) AS item_quantity FROM im_item_movement mv, ' + item_config.item_table + ' i WHERE mv.item_id = i.' + item_config.item_id + ' AND mv.type = "DEPOSIT" AND (i.' + item_config.item_name + ' LIKE ? OR i.' + item_config.item_sku + ' LIKE ?) AND mv.created > ? AND mv.deleted IS NULL GROUP BY i.' + item_config.item_id + ' ORDER BY i.' + item_config.item_name + ' ' + pagination, 
                        ["%"+params.search_item+"%", "%"+params.search_item+"%", balance_date],
                        function(err1, res1) {
                            if (!err1) {
                                deposited = res1;
                                mysql.use(db)
                                .query(
                                    'SELECT mv.item_id, i.' + item_config.item_sku + ' AS item_sku, i.' + item_config.item_name + ' AS item_name, SUM(mv.quantity) AS item_quantity FROM im_item_movement mv, ' + item_config.item_table + ' i WHERE mv.item_id = i.' + item_config.item_id + ' AND mv.type = "WITHDRAW" AND (i.' + item_config.item_name + ' LIKE ? OR i.' + item_config.item_sku + ' LIKE ?) AND mv.created > ? AND mv.deleted IS NULL GROUP BY i.' + item_config.item_id + ' ORDER BY i.' + item_config.item_name + ' ' + pagination,  
                                    ["%"+params.search_item+"%", "%"+params.search_item+"%", balance_date],
                                    function(err2, res2) {
                                        if (!err2) {
                                            withdrawn = res2;
                                            for (var i=0;i<deposited.length;i++) {
                                                for (var j=0;j<withdrawn.length;j++) {
                                                    if (deposited[i].item_id == withdrawn[j].item_id) {
                                                        deposited[i].item_quantity = (deposited[i].item_quantity - withdrawn[j].item_quantity);
                                                        break;
                                                    }
                                                }
                                            }
                                            send_callback(err2, deposited)
                                        }
                                        else {
                                            console.log(err2);
                                        }
                                    }
                                )
                            }
                            else {
                                console.log(err1);
                            }
                        }
                    )
                }
                else { //specific items only
                    //STOCK = SUM(deposited) - SUM(withdrawn)
                    mysql.use(db)
                    .query(
                        'SELECT mv.item_id, i.' + item_config.item_sku + ' AS item_sku, i.' + item_config.item_name + ' AS item_name, SUM(mv.quantity) AS item_quantity FROM im_item_movement mv, ' + item_config.item_table + ' i WHERE mv.item_id IN (?) AND mv.item_id = i.' + item_config.item_id + ' AND mv.type = "DEPOSIT" AND (i.' + item_config.item_name + ' LIKE ? OR i.' + item_config.item_sku + ' LIKE ?) AND mv.created > ? AND mv.deleted IS NULL GROUP BY i.' + item_config.item_id + ' ORDER BY i.' + item_config.item_name + ' ' + pagination, 
                        [params.item_id, "%"+params.search_item+"%", "%"+params.search_item+"%", balance_date],
                        function(err1, res1) {
                            if (!err1) {
                                deposited = res1;
                                mysql.use(db)
                                .query(
                                    'SELECT mv.item_id, i.' + item_config.item_sku + ' AS item_sku, i.' + item_config.item_name + ' AS item_name, SUM(mv.quantity) AS item_quantity FROM im_item_movement mv, ' + item_config.item_table + ' i WHERE mv.item_id IN (?) AND mv.item_id = i.' + item_config.item_id + ' AND mv.type = "WITHDRAW" AND (i.' + item_config.item_name + ' LIKE ? OR i.' + item_config.item_sku + ' LIKE ?)  AND mv.created > ? AND mv.deleted IS NULL GROUP BY i.' + item_config.item_id + ' ORDER BY i.' + item_config.item_name + ' ' + pagination,  
                                    [params.item_id, "%"+params.search_item+"%", "%"+params.search_item+"%", balance_date],
                                    function(err2, res2) {
                                        if (!err2) {
                                            withdrawn = res2;
                                            for (var i=0;i<deposited.length;i++) {
                                                for (var j=0;j<withdrawn.length;j++) {
                                                    if (deposited[i].item_id == withdrawn[j].item_id) {
                                                        deposited[i].item_quantity = (deposited[i].item_quantity - withdrawn[j].item_quantity);
                                                        break;
                                                    }
                                                }
                                            }
                                            send_callback(err2, deposited)
                                        }
                                        else {
                                            console.log(err2);
                                        }
                                    }
                                )
                            }
                            else {
                                console.log(err1);
                            }
                        }
                    )
                }
            }

            function send_response(err, result) {
                if (err) {
                    reject(err);
                }
                else {
                    //merge latest balance and latest item movements
                    for (var i=0;i<response.length;i++) {
                        for (var j=0;j<latest_balance.length;j++) {
                            if (response[i].location_id === latest_balance[j].location_id) { //match same locations from movements and latest balance
                                response[i].items = response[i].items.concat(latest_balance[j].items);
                                response[i].items.sort(function(a, b) { //sort alphabetically by item name before matching
                                    var textA = a.item_name.toUpperCase();
                                    var textB = b.item_name.toUpperCase();
                                    return (textA < textB) ? -1 : (textA > textB) ? 1 : 0;
                                });
                                break;
                            }
                        }
                    }

                    for (var x=0;x<response.length;x++) { // for every location
                        if (response[x].items.length !== 0) {
                            var matched_items = [];
                            var items = response[x].items;
                            for (var i=0;i<items.length;i++) {
                                for (var j=i+1;j<items.length;j++) { //add the quantity of matched items then add to the list
                                    if ((params.is_grouped == 1 && (items[i].item_id == items[j].item_id)) || (params.is_grouped == 0 && (items[i].item_id == items[j].item_id) && items[i].expiration_date == items[j].expiration_date)) { //if is_grouped, no need to match with expiration dates
                                        items[i].item_quantity = (items[i].item_quantity + items[j].item_quantity);
                                        matched_items.push(items[i]);
                                        break;
                                    } 
                                }
                            }
                            var final_items = matched_items;

                            for (var i=0;i<items.length;i++) {
                                var has_match = 0;
                                for (var j=0;j<matched_items.length;j++) { //add the items that did not match to the list as is
                                    if ((params.is_grouped == 1 && (items[i].item_id == matched_items[j].item_id)) || (params.is_grouped == 0 && (items[i].item_id == matched_items[j].item_id) && items[i].expiration_date == matched_items[j].expiration_date)) { //if is_grouped, no need to match with expiration dates
                                        has_match = 1;
                                        break;
                                    } 
                                }
                                if (has_match == 0) {
                                    final_items.push(items[i])
                                }
                            }
                            final_items.sort(function(a, b) { //sort alphabetically by item name again after different manipulations
                                var textA = a.item_name.toUpperCase();
                                var textB = b.item_name.toUpperCase();
                                return (textA < textB) ? -1 : (textA > textB) ? 1 : 0;
                            });

                            inventory.total = final_items.length;

                            if (params.page != -1) {
                                final_items = paginate(final_items, params.limit, params.page);
                            }
                            response[x].items = final_items;
                        }
                    }
                    inventory.items = response;
                    resolve(inventory);
                }
            }

            function format_date(date) {
                if (date != null) {
                    var dates = new Date(date);
                    var year = dates.getFullYear();
                    var month = dates.getMonth()+1;
                    var dt = dates.getDate();
        
                    if (dt < 10) {
                        dt = '0' + dt;
                    }
                    if (month < 10) {
                        month = '0' + month;
                    }
        
                    var hrs = dates.getHours();
                    var mins = dates.getMinutes();
                    var secs = dates.getSeconds();
        
                    if (hrs < 10) {
                        hrs = '0' + hrs;
                    }
                    if (mins < 10) {
                        mins = '0' + mins;
                    }
                    if (secs < 10) {
                        secs = '0' + secs;
                    }
        
                    var date_formatted = year + '-' + month + '-' + dt + " " + hrs + ":" + mins + ":" + secs;
        
                    return date_formatted;
                }
                else {
                    return null;
                }
            }

            function paginate (array, page_size, page_number) {
                --page_number; // because pages logically start with 1, but technically with 0
                return array.slice(page_number * page_size, (page_number + 1) * page_size);
              }
        })
    }

    module.save_current_inventory = (params) => {
        return new Promise(function(resolve, reject) {
            var inventory = [];
            var balance_id = uuid.v4();
            var current_location = null;
            
            start();

            function start() {
                if (!err) {
                    var retrieve_params = {
                        location_id: [],
                        item_id: [],
                        is_breakdown: 1,
                        is_grouped: 0,
                        page: -1, //to remove pagination in get_current_inventory
                    }

                    module.get_current_inventory(retrieve_params)
                    .then(function(response) {
                        inventory = response;
                        console.log(inventory);
                        mysql.use(db)
                        .query(
                            'INSERT INTO im_balance_history(id, label, user_id) VALUES (?,?,?);', 
                            [balance_id, params.label, params.user_id],
                            function(err1, res1) {
                                if (err1) {
                                    console.log(err1);
                                    reject(err1);
                                }
                                else {
                                    async.each(inventory, prepare_save_details, send_response);
                                }   
                            }
                        )  
                    })
                    .catch(function(err) {           
                        console.log(err);
                        reject(err);
                    })
                }
                else {
                    console.log(err);
                    reject(err); 
                }
            }

            function prepare_save_details(row, callback) {
                function send_callback(err, result) {
                    if (err) {
                        console.log(err);
                        return callback(err);
                    }
                    return callback();
                }
                
                console.log(row.items);
                if (row.items.length) {
                    current_location = row.location_id;
                    async.each(row.items, save_details, send_callback)
                }
                else {
                    send_callback(null, null);
                }
            }

            function save_details(row, callback) {
                function send_callback(err, result) {
                    if (err) {
                        console.log(err);
                        return callback(err);
                    }
                    return callback();
                }
                
                mysql.use(db)
                .query(
                    'INSERT INTO im_balance_history_details(id, balance_id, location_id, item_id, expiration_date, quantity) VALUES (?,?,?,?,?,?)', 
                    [uuid.v4(), balance_id, current_location, row.item_id, row.expiration_date, row.item_quantity],
                    send_callback
                )
            }

            function send_response(err, result) {
                if (err) {
                    reject(err);
                }
                else {
                    resolve(inventory);
                }
            }
        })
    }

    module.get_balance_history = (params) => {
        return new Promise(function(resolve, reject) {
            let balance = {};

            function format_date(date) {
                if (date != null) {
                    var dates = new Date(date);
                    var year = dates.getFullYear();
                    var month = dates.getMonth()+1;
                    var dt = dates.getDate();
        
                    if (dt < 10) {
                        dt = '0' + dt;
                    }
                    if (month < 10) {
                        month = '0' + month;
                    }
        
                    var hrs = dates.getHours();
                    var mins = dates.getMinutes();
                    var secs = dates.getSeconds();
        
                    if (hrs < 10) {
                        hrs = '0' + hrs;
                    }
                    if (mins < 10) {
                        mins = '0' + mins;
                    }
                    if (secs < 10) {
                            }
        
                    var date_formatted = year + '-' + month + '-' + dt + " " + hrs + ":" + mins + ":" + secs;
        
                    return date_formatted;
                }
                else {
                    return null;
                }
            }

            if (typeof params.search === 'undefined' || params.search === undefined) {
                params.search = '';
            }

            params.from_date = format_date(params.from_date);
            params.to_date = format_date(params.to_date);

            if (params.from_date !== null && params.to_date !== null) {
                mysql.use(db)
                .query(
                    'SELECT bh.id, bh.label, bh.created, bh.updated, bh.deleted, bh.user_id, u.' + user_config.user_first_name + ' AS user_first_name, u.' + user_config.user_last_name + ' AS user_last_name, (SELECT COUNT(*) FROM im_balance_history bh WHERE bh.label LIKE ? AND (bh.created BETWEEN ? AND ?)) AS total FROM im_balance_history bh, ' + user_config.user_table + ' u WHERE u.' + user_config.user_id + ' = bh.user_id AND bh.label LIKE ? AND (bh.created BETWEEN ? AND ?) LIMIT ?,?',
                    ["%"+params.search+"%", params.from_date, params.to_date, "%"+params.search+"%", params.from_date, params.to_date, params.page, params.limit],
                    send_response
                )
                .end();
            }
            else {
                mysql.use(db)
                .query(
                    'SELECT bh.id, bh.label, bh.created, bh.updated, bh.deleted, bh.user_id, u.' + user_config.user_first_name + ' AS user_first_name, u.' + user_config.user_last_name + ' AS user_last_name, (SELECT COUNT(*) FROM im_balance_history bh WHERE bh.label LIKE ?) AS total FROM im_balance_history bh, ' + user_config.user_table + ' u WHERE u.' + user_config.user_id + ' = bh.user_id AND bh.label LIKE ? LIMIT ?,?',
                    ["%"+params.search+"%", "%"+params.search+"%", params.page, params.limit],
                    send_response
                )
                .end();
            }

            function send_response(err, result) {
                if (err) {
                    reject(err);
                }
                else {
                    if (result.length) {
                        balance.total = result[0].total;
                        for (var i=0;i<result.length;i++) {
                            delete result[i].total;
                        }
                    }
                    else {
                        balance.total = 0;
                    }
                    balance.items = result;
                    resolve(balance);
                }
            }
        }) 
    }

    module.get_inventory = (params) => {
        return new Promise(function(resolve, reject) {
            var response = [];
            var pagination = null;

            if (typeof params.search_item === 'undefined' || params.search_item === undefined) {
                params.search_item = '';
            }
            if (typeof params.is_breakdown === 'undefined' || params.is_breakdown === undefined) {
                params.is_breakdown = 1;
            }
            if (typeof params.is_grouped === 'undefined' || params.is_grouped === undefined) {
                params.is_grouped = 1;
            }
            
            if (params.page === -1) {
                pagination = "";
            }
            else {
                pagination = "LIMIT " + params.page + ", " + params.limit; 
            }

            if (params.is_breakdown == 1) { //default for specific locations
                if (params.location_id.length === 0) { //get for all locations
                    mysql.use(db)
                    .query(
                        'SELECT bh.id AS balance_id, bh.label, l.id AS location_id, l.code AS location_code, l.name AS location_name, u.' + user_config.user_id + ' AS user_id,  u.' + user_config.user_first_name + ' AS user_first_name, u.' + user_config.user_last_name + ' AS user_last_name, bh.created FROM im_balance_history bh, im_location l, ' + user_config.user_table + ' u WHERE l.id IN (SELECT DISTINCT location_id FROM im_balance_history_details WHERE balance_id = ?) AND u.' + user_config.user_id + ' = bh.user_id AND bh.id = ?',
                        [params.balance_id, params.balance_id],
                        function(err, res) {
                            if (err) {
                                console.log(err);
                                reject(err);
                            }
                            else {
                                async.each(res, fetch_items_breakdown, send_response); //get items for each location
                            }
                        }
                    )
                }
                else { //only retrieve those in specific locations
                    mysql.use(db)
                    .query(
                        'SELECT bh.id AS balance_id, bh.label, l.id AS location_id, l.code AS location_code, l.name AS location_name, u.' + user_config.user_id + ' AS user_id,  u.' + user_config.user_first_name + ' AS user_first_name, u.' + user_config.user_last_name + ' AS user_last_name, bh.created FROM im_balance_history bh, im_location l, ' + user_config.user_table + ' u WHERE l.id IN (SELECT DISTINCT location_id FROM im_balance_history_details WHERE balance_id = ?) AND l.id IN (?) AND u.' + user_config.user_id + ' = bh.user_id AND bh.id = ?',
                        [params.balance_id, params.location_id, params.balance_id],
                        function(err, res) {
                            if (err) {
                                console.log(err);
                                reject(err);
                            }
                            else {
                                async.each(res, fetch_items_breakdown, send_response); //get items for each location
                            }
                        }
                    )
                }
            }
            else { //location filter has been set to 'all' (is_breakdown = 0)
                mysql.use(db)
                .query(
                    'SELECT bh.id AS balance_id, bh.label, u.' + user_config.user_id + ' AS user_id,  u.' + user_config.user_first_name + ' AS user_first_name, u.' + user_config.user_last_name + ' AS user_last_name FROM im_balance_history bh, ' + user_config.user_table + ' u WHERE u.' + user_config.user_id + ' = bh.user_id AND bh.id = ?',
                    [params.balance_id],
                    function(err, res) {
                        if (err) {
                            console.log(err);
                            reject(err);
                        }
                        else {
                            async.each(res, fetch_items_no_breakdown, send_response); //get items for each location
                        }
                    }
                )
            }

            function fetch_items_breakdown(row, callback) {
                function send_callback(err, result) {
                    if (err) {
                        console.log(err);
                        return callback(err);
                    }
                    row['items'] = result;
                    response.push(row);
                    return callback();
                }

                if (params.is_grouped == 1) {
                    var group_clause = "GROUP BY i." + item_config.item_id;
                    var exp_clause = "";
                }
                else {
                    var group_clause = "GROUP BY hd.item_id, hd.expiration_date";
                    var exp_clause = ", hd.expiration_date";
                }
                
                if (params.item_id.length === 0) { //all items (not locations)
                    mysql.use(db)
                    .query(
                        'SELECT hd.item_id, i.' + item_config.item_sku + ' AS item_sku, i.' + item_config.item_name + ' AS item_name, SUM(hd.quantity) AS item_quantity' + exp_clause + ' FROM im_balance_history_details hd, ' + item_config.item_table + ' i WHERE hd.location_id = ? AND hd.item_id = i.' + item_config.item_id + ' AND (i.' + item_config.item_name + ' LIKE ? OR i.' + item_config.item_sku + ' LIKE ?) AND hd.balance_id = ? ' + group_clause + ' ORDER BY i.' + item_config.item_name + ' ' + pagination, 
                        [row.location_id, "%"+params.search_item+"%", "%"+params.search_item+"%", params.balance_id],
                        send_callback
                    )
                }
                else { //specific items
                    mysql.use(db)
                    .query(
                        'SELECT hd.item_id, i.' + item_config.item_sku + ' AS item_sku, i.' + item_config.item_name + ' AS item_name, SUM(hd.quantity) AS item_quantity' + exp_clause + ' FROM im_balance_history_details hd, ' + item_config.item_table + ' i WHERE hd.location_id = ? AND hd.item_id IN (?) AND hd.item_id = i.' + item_config.item_id + ' AND (i.' + item_config.item_name + ' LIKE ? OR i.' + item_config.item_sku + ' LIKE ?) AND hd.balance_id = ? ' + group_clause + ' ORDER BY i.' + item_config.item_name + ' ' + pagination, 
                        [row.location_id, params.item_id, "%"+params.search_item+"%", "%"+params.search_item+"%", params.balance_id],
                        send_callback
                    )
                }
            }

            function fetch_items_no_breakdown(row, callback) {
                function send_callback(err, result) {
                    if (err) {
                        console.log(err);
                        return callback(err);
                    }
                    row['items'] = result;
                    response.push(row);
                    return callback();
                }
                
                if (params.item_id.length === 0) { //all items (not locations)
                    mysql.use(db)
                    .query(
                        'SELECT hd.item_id, i.' + item_config.item_sku + ' AS item_sku, i.' + item_config.item_name + ' AS item_name, SUM(hd.quantity) AS item_quantity FROM im_balance_history_details hd, ' + item_config.item_table + ' i WHERE hd.item_id = i.' + item_config.item_id + ' AND (i.' + item_config.item_name + ' LIKE ? OR i.' + item_config.item_sku + ' LIKE ?) AND hd.balance_id = ? GROUP BY i.' + item_config.item_id + ' ORDER BY i.' + item_config.item_name + ' ' + pagination,
                        ["%"+params.search_item+"%", "%"+params.search_item+"%", params.balance_id],
                        send_callback
                    )
                }
                else { //specific items
                    mysql.use(db)
                    .query(
                        'SELECT hd.item_id, i.' + item_config.item_sku + ' AS item_sku, i.' + item_config.item_name + ' AS item_name, SUM(hd.quantity) AS item_quantity FROM im_balance_history_details hd, ' + item_config.item_table + ' i WHERE hd.item_id IN (?) AND hd.item_id = i.' + item_config.item_id + ' AND (i.' + item_config.item_name + ' LIKE ? OR i.' + item_config.item_sku + ' LIKE ?) AND hd.balance_id = ? GROUP BY i.' + item_config.item_id + ' ORDER BY i.' + item_config.item_name + ' ' + pagination, 
                        [params.item_id, "%"+params.search_item+"%", "%"+params.search_item+"%", params.balance_id],
                        send_callback
                    )
                }
            }

            function send_response(err, result) {
                if (err) {
                    reject(err);
                }
                else {
                    //return the result
                    resolve(response);
                }
            }
        })
    }

    module.get_expiration_date = (params) => {
        return new Promise(function(resolve, reject) {
            mysql.use(db)
            .query(
                'SELECT * FROM im_location WHERE id = ? AND deleted IS NULL', 
                [params.location_id],
                function(err1, res1) {
                    if (err1) {
                        console.log("Error in verifying location in get_expiration_date");
                        reject(new Error("Error in verifying location"));
                    } 
                    else if (!res1.length) {
                        console.log("Location not found in get_expiration_date");
                        reject(new Error("Location not found"));
                    }
                    else {
                        start();
                    }
                }
            )

            function start() {
                var retrieve_params = {
                    location_id: [params.location_id],
                    item_id: [params.item_id],
                    is_breakdown: 1,
                    is_grouped: 0,
                    page: -1, //to remove pagination in get_current_inventory
                    user_id: params.user_id
                }
    
                module.get_current_inventory(retrieve_params)
                .then(function(response) {
                    send_response(response);
                })
                .catch(function(err) {           
                    console.log('Error in getting current inventory inside get expiration date');     
                    reject(err);
                })
            }

            function send_response(inventory) {
                var expiration_dates_with_qty = [];
                var items = inventory[0].items;
                if (!items.length) {
                    console.log("Item not found in specified location in get expiration date");
                    reject(new Error("Item not found in specified location"));
                }
                else {
                    for (var i=0;i<items.length;i++) {
                        var exp_obj = {};
                        exp_obj.expiration_date = items[i].expiration_date;
                        exp_obj.max_quantity = items[i].item_quantity;
                        expiration_dates_with_qty.push(exp_obj);
                    }
                    resolve(expiration_dates_with_qty);
                }
            }
        })
    }

    module.init_cyclecount = (params) => {
        return new Promise(function(resolve, reject) {
            var report_id = uuid.v4();
            
            mysql.use(db)
            .query(
                'SELECT * FROM im_location WHERE id = ? AND deleted IS NULL', 
                [params.location_id],
                function(err1, res1) {
                    if (err1) {
                        console.log("Error in verifying location in init cyclecount");
                        reject(new Error("Error in verifying location"));
                    } 
                    else if (!res1.length) {
                        console.log("Location not found in init cyclecount");
                        reject(new Error("Location not found"));
                    }
                    else {
                        start();
                    }
                }
            )

            function start() {
                mysql.use(db)
                .query(
                    'INSERT INTO im_cycle_count(id, location_id, cycle_label, max_cycle, user_id) VALUES (?,?,?,?,?)', 
                    [report_id, params.location_id, params.cycle_label, params.max_cycle, params.user_id],
                    function(err1, res1) {
                        if (err1) {
                            console.log("Error in creating new cyclecount report")
                            reject(new Error("Error in creating new cycle count report"));
                        }
                        else {
                            async.each(params.items, create_details, send_response);
                        }
                    }
                )
            }

            function create_details(row, callback) {
                function send_callback(err, result) {
                    if (err) {
                        console.log('Error in creating new cyclecount report details');
                        return callback(err);
                    }
                    return callback();
                }
                
                mysql.use(db)
                .query(
                    'INSERT INTO im_cycle_count_details(id, cycle_count_id, item_id, actual_quantity) VALUES (?,?,?,?)', 
                    [uuid.v4(), report_id, row.item_id, row.item_quantity],
                    send_callback
                )
            }

            function send_response(err, res) {
                if (err) {
                    console.log("Error in initializing cycle count");
                    reject("Error in initializing cycle count");
                }
                else {
                    params.report_id = report_id;
                    resolve(params);
                }
            }
        })
    }

    module.get_pending_cyclecount = (params) => {
        return new Promise(function(resolve, reject) {      

            if (typeof params.search === 'undefined' || params.search === undefined) {
                params.search = '';
            }

            mysql.use(db)
            .query(
                'SELECT cc.id, cc.created AS date, cc.cycle_label, cc.location_id, l.code AS location_code, l.name AS location_name, cc.user_id, u.' + user_config.user_first_name + ' AS user_first_name, u.' + user_config.user_last_name + ' AS user_last_name, cc.round, cc.max_cycle FROM im_cycle_count cc, im_location l, ' + user_config.user_table + ' u WHERE cc.location_id = l.id AND cc.user_id = u.' + user_config.user_id + ' AND cc.cycle_label LIKE ? AND cc.status = "PENDING" AND cc.deleted IS NULL LIMIT ?,?', 
                ["%"+params.search+"%", params.page, params.limit],
                send_response
            )

            function send_response(err, res, args, last_query) {
                if (err) {
                    console.log(err);
                    console.log("Error in retrieving pending cycle count");
                    reject("Error in retrieving pending cycle count");
                }
                else {
                    resolve(res);
                }
            }
        })
    }

    module.get_pending_cyclecount_details = (params) => {
        return new Promise(function(resolve, reject) {   
            var cycle_label = null;
            var round = null;
            var date = null;
            var location_id = null;
            var location_code = null;
            var location_name = null;

            mysql.use(db)
            .query(
                'SELECT cc.cycle_label, cc.round, cc.created, cc.location_id, l.code AS location_code, l.name AS location_name FROM im_cycle_count cc, im_location l WHERE cc.location_id = l.id AND cc.id = ? AND cc.status = "PENDING" AND cc.deleted IS NULL', 
                [params.report_id],
                function(err1, res1) {
                    if (err1) {
                        console.log("Error in verifying report id in get pending cyclecount details");
                        reject(new Error("Error in verifying report_id"));
                    } 
                    else if (!res1.length) {
                        console.log("Report id not found in get pending cyclecount details");
                        reject(new Error("Cycle count report not found"));
                    }
                    else {
                        cycle_label = res1[0].cycle_label;
                        round = res1[0].round;
                        date = res1[0].created;
                        location_id = res1[0].location_id;
                        location_code = res1[0].location_code;
                        location_name = res1[0].location_name;
                        start();
                    }
                }
            )

            function start() {
                mysql.use(db)
                .query(
                    'SELECT cd.id, cd.item_id, i.' + item_config.item_sku + ' AS item_sku, i.' + item_config.item_name + ' AS item_name FROM im_cycle_count_details cd, ' + item_config.item_table + ' i WHERE cd.item_id = i.' + item_config.item_id + ' AND cd.cycle_count_id = ? AND (cd.variance IS NULL OR cd.variance != 0.0) LIMIT ?,?', 
                    [params.report_id, params.page, params.limit],
                    send_response
                )
            }

            function send_response(err, res, args, last_query) {
                if (err) {
                    console.log(err);
                    console.log("Error in retrieving pending cycle count details");
                    reject("Error in retrieving pending cycle count details");
                }
                else {
                    var response = {};
                    response.date = date;
                    response.cycle_label = cycle_label;
                    response.round = round;
                    response.location_id = location_id;
                    response.location_code = location_code;
                    response.location_name = location_name;
                    response.items = res;
                    resolve(response);
                }
            }
        })
    }

    module.cyclecount = (params) => {
        return new Promise(function(resolve, reject) {
            var round = null;
            var max_cycle = null;
            var status = null;

            mysql.use(db)
            .query(
                'SELECT * FROM im_cycle_count WHERE id = ? AND status = "PENDING" AND deleted IS NULL', 
                [params.report_id],
                function(err1, res1) {
                    if (err1) {
                        console.log("Error in verifying report id in get pending cyclecount details");
                        reject(new Error("Error in verifying report_id"));
                    } 
                    else if (!res1.length) {
                        console.log("Report id not found in init cyclecount");
                        reject(new Error("Cycle count report not found"));
                    }
                    else {
                        round = res1[0].round;
                        max_cycle = res1[0].max_cycle;
                        status = res1[0].status;
                        async.each(params.items, update_details, send_response);
                    }
                }
            )

            function update_details(row, callback) {
                function send_callback(err, result) {
                    if (err) {
                        console.log('Error in updating cyclecount report details');
                        return callback(err);
                    }
                    return callback();
                }
                
                mysql.use(db)
                .query(
                    'UPDATE im_cycle_count_details SET cc_count = ?, variance = (? - actual_quantity) WHERE item_id = ? AND cycle_count_id = ?', 
                    [row.item_count, row.item_count, row.item_id, params.report_id],
                    send_callback
                )
            }
            

            function send_response(err, res) {
                if (err) {
                    console.log("Error in updating cycle count details");
                    reject("Error in updating cycle count");
                }
                else {
                    round = round + 1;
                    if (round == max_cycle) {
                        status = "DONE";
                    }
                    mysql.use(db)
                    .query(
                        'UPDATE im_cycle_count SET round = ?, status = ? WHERE id = ?', 
                        [round, status, params.report_id],
                        function(err1, res1) {
                            if (err1) {
                                console.log(err1);
                                reject("Error in updating cycle count");
                            }
                            else {
                                resolve();
                            }
                        }
                    )
                }
            }
        })
    }

    module.get_cyclecount_history = (params) => {
        return new Promise(function(resolve, reject) {      

            if (typeof params.search === 'undefined' || params.search === undefined) {
                params.search = '';
            }

            mysql.use(db)
            .query(
                'SELECT cc.id, cc.created AS date, cc.cycle_label, cc.location_id, l.code AS location_code, l.name AS location_name, cc.user_id, u.' + user_config.user_first_name + ' AS user_first_name, u.' + user_config.user_last_name + ' AS user_last_name, cc.round, cc.max_cycle FROM im_cycle_count cc, im_location l, ' + user_config.user_table + ' u WHERE cc.location_id = l.id AND cc.user_id = u.' + user_config.user_id + ' AND cc.cycle_label LIKE ? AND cc.status = "DONE" AND cc.deleted IS NULL LIMIT ?,?', 
                ["%"+params.search+"%", params.page, params.limit],
                send_response
            )

            function send_response(err, res, args, last_query) {
                if (err) {
                    console.log(err);
                    console.log("Error in retrieving cycle count history");
                    reject("Error in retrieving cycle count history");
                }
                else {
                    resolve(res);
                }
            }
        })
    }

    module.get_cyclecount_history_details = (params) => {
        return new Promise(function(resolve, reject) {   
            var cycle_label = null;
            var round = null;
            var date = null;
            var location_id = null;
            var location_code = null;
            var location_name = null;

            mysql.use(db)
            .query(
                'SELECT cc.cycle_label, cc.round, cc.created, cc.location_id, l.code AS location_code, l.name AS location_name FROM im_cycle_count cc, im_location l WHERE cc.location_id = l.id AND cc.id = ? AND cc.status = "DONE" AND cc.deleted IS NULL', 
                [params.report_id],
                function(err1, res1) {
                    if (err1) {
                        console.log("Error in verifying report id in get cyclecount history details");
                        reject(new Error("Error in verifying report_id"));
                    } 
                    else if (!res1.length) {
                        console.log("Report id not found in get cyclecount history details");
                        reject(new Error("Cycle count report not found"));
                    }
                    else {
                        cycle_label = res1[0].cycle_label;
                        round = res1[0].round;
                        date = res1[0].created;
                        location_id = res1[0].location_id;
                        location_code = res1[0].location_code;
                        location_name = res1[0].location_name;
                        start();
                    }
                }
            )

            function start() {
                mysql.use(db)
                .query(
                    'SELECT cd.id, cd.item_id, i.' + item_config.item_sku + ' AS item_sku, i.' + item_config.item_name + ' AS item_name, cd.actual_quantity AS item_quantity, cd.cc_count AS item_count, cd.variance FROM im_cycle_count_details cd, ' + item_config.item_table + ' i WHERE cd.item_id = i.' + item_config.item_id + ' AND cd.cycle_count_id = ? LIMIT ?,?', 
                    [params.report_id, params.page, params.limit],
                    send_response
                )
            }

            function send_response(err, res, args, last_query) {
                if (err) {
                    console.log(err);
                    console.log("Error in retrieving cycle count history details");
                    reject("Error in retrieving cycle count history details");
                }
                else {
                    var response = {};
                    response.date = date;
                    response.cycle_label = cycle_label;
                    response.round = round;
                    response.location_id = location_id;
                    response.location_code = location_code;
                    response.location_name = location_name;
                    response.items = res;
                    resolve(response);
                }
            }
        })
    }

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

    module.create_location = (params) => {
        return new Promise(function(resolve, reject) {
            
            params.id = uuid.v4();

            let location = {};
             
            mysql.use(db)
            .query(
                `SELECT * FROM im_location 
                    WHERE code = ? AND user_id = ? 
                    AND deleted IS NULL`,
                    [params.code, params.user_id],
                    function(err, result) {
                        if (err) {
                            console.log(err);
                            reject(err);
                        }
        
                        if (result.length) {
                            console.log("Location already exists");             
                            reject(err);
                                
                        }
                        else {
                            if (params.status == false || params.status.toLowerCase() == "false") { //create a deactivated location
                                mysql.use(db)
                                .query(
                                    `INSERT INTO im_location (id, code, name, description, user_id, deleted) 
                                        VALUES (?, ?, ?, ?, ?, now())`,
                                        [params.id, params.code, params.name, params.description, params.user_id],
                                        send_response
                                )
                            }
                            else { //create an activated location
                                mysql.use(db)
                                .query(
                                    `INSERT INTO im_location (id, code, name, description, user_id) 
                                        VALUES (?, ?, ?, ?, ?)`,
                                        [params.id, params.code, params.name, params.description, params.user_id],
                                        send_response
                                )
                            }
                        }
                    }
                )            

            function send_response(error, result, args, last_query){
                if (error) {
                    console.log(error);
                    reject(error);
                }
                else {
                    location.message = "Successfully created a new location";
                    location.items = params;
                    resolve(location);
                }
            }
        })
    }


    module.retrieve_locations = (params) => {
        return new Promise(function(resolve, reject) {
            let filter_query = ' ';
            let location = {};

            if (params.filter_status == false || params.filter_status.toLowerCase() == "false") {
                filter_query = ' AND deleted IS NOT NULL ';   
            }

            else {
                filter_query = ' AND deleted IS NULL ';     
            }
            
            mysql.use(db)
            .query(
                `SELECT id, code, name, description, user_id,
                    created AS date_created, 
                    updated AS date_updated,
                    deleted AS date_deleted,
                    (SELECT COUNT(*) 
                    FROM im_location 
                    WHERE (code LIKE ? OR name LIKE ?)` + filter_query + `) 
                    AS total 
                    FROM im_location
                    WHERE (code LIKE ? OR name LIKE ?)` + filter_query + `
                    LIMIT ?, ?`,
                    ["%"+params.search+"%", "%"+params.search+"%", "%"+params.search+"%", "%"+params.search+"%", params.page, params.limit],
                    function(err, result) {
                        if (err) {
                            console.log(err);
                            reject(err);
                        }
                        else {
                            if (result.length) {
                                location.total = result[0].total;
                                for (var i=0;i<result.length;i++) {
                                    delete result[i].total;
                                }
                            }
                            else {
                                location.total = 0;
                            }
                            location.items = result;

                            resolve(location);
                        }
                    }
            )

        })
    }


    module.retrieve_location = (params) => {
        return new Promise(function(resolve, reject) {
            let location = {}; 
            mysql.use(db)
            .query(
                `SELECT id, code, name, description, user_id,
                    created AS date_created, 
                    updated AS date_updated,
                    deleted AS date_deleted 
                    FROM im_location 
                    WHERE id = ?`,
                    [params.id],
                    function(err, result) {
                        if (err) {
                            console.log(err);
                            reject(err);
                        }
                        else{                        
                            location.items = result;
                                
                            resolve(location);
                        } 
                        
                    }
            )
            .end();

        })
    }


    module.change_location_status = (params) => {
        return new Promise(function(resolve, reject) {
            let location = {};

            mysql.use(db)
            .query(
                `SELECT * FROM im_location 
                    WHERE id = ? AND user_id = ? 
                    AND deleted IS NULL`,
                    [params.id, params.user_id],
                    function(err, res) {
                        if (err) {
                            console.log(err);
                            reject(err);
                        }
                        else if (!res.length) {
                            console.log("Location not found")
                            reject(new Error("Location not found"));
                        }
                        else {
                            if (params.status == false || params.status.toLowerCase() == "false") {
                                mysql.use(db)
                                .query(
                                    `UPDATE im_location SET deleted = now(), updated = now()
                                        WHERE id = ? and user_id = ?`,
                                        [params.id, params.user_id],
                                        send_response
                                )
                            }
                            else {
                                mysql.use(db)
                                .query(
                                    `UPDATE im_location SET deleted = NULL, updated = now()
                                        WHERE id = ? and user_id = ?`,
                                        [params.id, params.user_id],
                                        send_response
                                )
                            }
                        }
                    }
            )

            function send_response(err, res) {
                if (err) {
                    console.log(err);
                    reject(err);
                }
                else {
                    location.message = "Successfully updated location status";
                    location.items = params;
                    resolve(location);
                }
            }

        })
    }



    module.update_location = (params) => {
        return new Promise(function(resolve, reject) {
            
            let location = {};

            mysql.use(db)
            .query(
                `SELECT * FROM im_location 
                    WHERE id = ? AND user_id = ? 
                    AND deleted IS NULL`,
                    [params.id, params.user_id],
                    function(err, res) {
                        if (err) {
                            console.log(err);
                            reject(err);
                        }
                        else if (!res.length) {
                            console.log("Location not found")
                            reject(new Error("Location not found"));
                        }
                        else if (typeof params.code !== 'undefined' && params.code !== undefined) {
                            find_code_duplicate();
                        }
                        else {
                            mysql.use(db)
                            .query(
                                `UPDATE im_location SET ?
                                    WHERE id = ? and user_id = ?`,
                                    [params, params.id, params.user_id],
                                    send_response
                            )
                        }
                    }
            )

            function find_code_duplicate() {
                mysql.use(db)
                .query(
                    `SELECT * FROM im_location
                        WHERE code = ? AND id != ?`,
                        [params.code, params.id],
                        function(err, res) {
                            if (err) {
                                console.log(err);
                                reject(err);
                            }
                            else if (res.length) {
                                console.log("Code already exists")
                                reject(new Error("Code already exists"));
                            }
                            else {
                                mysql.use(db)
                                .query(
                                    `UPDATE im_location SET ?
                                        WHERE id = ? and user_id = ?`,
                                        [params, params.id, params.user_id],
                                        send_response
                                )
                            }
                        }
                )
            }

            function send_response(err, res) {
                if (err) {
                    console.log(err);
                    reject(err);
                }
                else {
                    location.message = "Successfully updated location";
                    location.items = params;
                    resolve(location);
                }
            }

        })
    }

    module.deposit = (params) => {
        return new Promise(function(resolve, reject) {
            let transaction_id = uuid.v4();
            let movement = {};

            mysql.use(db)
            .query(
                `INSERT INTO im_movement_transaction(id, user_id, type)
                    VALUES (?, ?, "DEPOSIT")`,
                    [transaction_id, params.user_id],
                    function(err, res) {
                        if (err) {
                            console.log(err);
                            reject(err);
                        }
                        else {
                            async.each(params.items, insert_items, send_response);
                        }
                    }
            )

            function insert_items(row, callback) {
                function send_callback(err, result) {
                    if (err) {
                        console.log('Error in creating item movement');
                        return callback(err);
                    }
                    return callback();
                }

                if (row.expiration_date == null || row.expiration_date == 'null' || row.expiration_date == '') {
                    mysql.use(db)
                    .query(
                        `INSERT INTO im_item_movement
                            (id, transaction_id, item_id, quantity, location_id, remarks, type, user_id) 
                            VALUES (?, ?, ?, ?, ?, ?, "DEPOSIT", ?)`, 
                            [uuid.v4(), transaction_id, row.item_id, row.quantity, row.location_id, row.remarks, params.user_id],
                            send_callback
                    )
                }

                else {
                    mysql.use(db)
                    .query(
                        `INSERT INTO im_item_movement
                            (id, transaction_id, item_id, quantity, location_id, expiration_date, remarks, type, user_id) 
                            VALUES (?, ?, ?, ?, ?, ?, ?, "DEPOSIT", ?)`, 
                            [uuid.v4(), transaction_id, row.item_id, row.quantity, row.location_id, row.expiration_date, row.remarks, params.user_id],
                            send_callback
                    )
                }
            }

            function send_response(err, result) {
                if (err) {
                    console.log(err);
                    reject(err);
                }
                else {
                    movement.user_id = params.user_id;
                    movement.type = "DEPOSIT";
                    movement.items = params.items;
                    movement.message = "Deposit successful";
                    resolve(movement);
                }
            }
        })
    }


    module.withdraw = (data) => {
        return new Promise(function(resolve, reject) {
            
            const datum = data[0];
            let noLocation = 0;

            function check_location(cb){
    
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
                                        datum.items[i].franchise_id = datum.franchise_id;
                                        datum.items[i].type = "WITHDRAW"
    
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
                            qry = 'SELECT quantity, type FROM im_item_movement WHERE item_id = '+mysql.escape(item.item_id)+' AND location_id = '+mysql.escape(item.location_id)+' AND franchise_id ='+mysql.escape(item.franchise_id)+' AND expiration_date= '+mysql.escape(item.expiration_date)+' AND deleted IS NULL';
                        }else{
                            qry = 'SELECT quantity, type FROM im_item_movement WHERE item_id = '+mysql.escape(item.item_id)+' AND location_id = '+mysql.escape(item.location_id)+' AND franchise_id ='+mysql.escape(item.franchise_id)+' AND deleted IS NULL';
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
                   
                    const transaction_id = uuid.v4();

                    mysql.use(db)
                        .query(
                            'INSERT INTO im_movement_transaction (id, franchise_id, user_id, type) VALUES (?,?,?, "WITHDRAW")',
                            [transaction_id,datum.franchise_id,datum.user_id],
                            function(err,res) {
                                if (err) {
                                    reject(err);
                                } else {
                                    for(let i=0; i<datum.items.length; i++) {
                                        mysql.use(db)
                                        .query(
                                            'INSERT INTO im_item_movement (id, franchise_id, item_id, quantity, location_id, expiration_date, remarks, user_id, type,transaction_id) VALUES (?,?,?,?,?,?,?,?,?,?)',
                                            [datum.items[i].id,datum.items[i].franchise_id, datum.items[i].item_id, datum.items[i].quantity, datum.items[i].location_id, datum.items[i].expiration_date, datum.items[i].remarks, datum.items[i].user_id, datum.items[i].type,transaction_id],
                                            function(err1, res1) {
                                                if (err1) {
                                                    reject(err1);
                                                } else {
                                                    if(i == datum.items.length-1) {
                                                        resolve([datum.items, {message: "Items successfully withdrawn", transaction_id: transaction_id}]);
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
                                            franchise_id    : datum.franchise_id,
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
                                                    franchise_id    : datum.franchise_id,
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
                                    'INSERT INTO im_movement_transaction (id, franchise_id, user_id, type) VALUES (?,?,?,"TRANSFER")',
                                    [transaction_id, datum.franchise_id, datum.user_id],
                                    function(err,res){
                                        if (err) {
                                            reject(err);
                                        }else{
                                            for(let i=0; i<verified.length; i++){
                                                mysql.use(db)
                                                .query(
                                                    'INSERT INTO im_item_movement (id, franchise_id, item_id, quantity, location_id, expiration_date, remarks, user_id, type,transaction_id) VALUES (?,?,?,?,?,?,?,?,?,?)',
                                                    [verified[i].id, verified[i].franchise_id, verified[i].item_id, verified[i].quantity, verified[i].location_id, verified[i].expiration_date, verified[i].remarks, verified[i].user_id, verified[i].type,transaction_id],
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

