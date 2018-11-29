'use strict'

const mysql             = require('anytv-node-mysql');
const config            = require(__dirname + '/config/config');
const promise           = require('promise');
const UUID              = require('uuid');


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



    module.create_location = (data) => {
        return new Promise(function(resolve, reject) {
            
            const uuid =UUID.v4();

            let datum = data[0];
                datum.id=uuid
            let deleted = null;
            
            if(datum.status==false || datum.status.toLowerCase()=="false"){
                deleted = new Date();
            }
                     

            function start(){                
                mysql.use(db)
                .query(
                    'SELECT id,code FROM im_location WHERE code = ? AND user_id=? AND deleted IS NULL',
                    [datum.code, datum.user_id],
                    send_response
                ).end()                
            }

            function send_response(err, result, args, last_query){
                if (err) {
                    reject(err);
                }

                if (result.length > 0) {             
                    reject({code: "DUP_ENTRY"})
                        
                }else{
                    
                    mysql.use(db)
                    .query(
                        'INSERT INTO im_location (id, code, name, description, user_id, deleted) VALUES (?,?,?,?,?,?)',
                        [datum.id,datum.code, datum.name, datum.description, datum.user_id,deleted],
                        function(error, result) {
                            if (error) {
                                reject(error);
                            }else{
                                

                                let location = {
                                    message:    'Successfully created location',
                                    id:          datum.id,
                                    code:        datum.code,
                                    name:        datum.name,
                                    description: datum.description,
                                    user_id:     datum.user_id,
                                    status:      datum.status            
                                };
                                    
                                resolve([location])
                                
                            }
                                                
                        }
                    )
                    .end();

                }
            }

            start();

            

        })
    }


    module.retrieve_locations = (data) => {
        return new Promise(function(resolve, reject) {     
            
                let datum = data[0];

                let status  = '';

                if(datum.filter_status == undefined || datum.filter_status == null){
                    status=' ';
                }else if(datum.filter_status == true || datum.filter_status.toLowerCase() == "true"){
                    status=' AND deleted IS NULL';
                }else if(datum.filter_status == false || datum.filter_status.toLowerCase() == "false"){
                    status=' AND deleted IS NOT NULL';
                }

                let qry     = 'SELECT * ';
                let count   = 'SELECT COUNT(id) '
                let from    = ' FROM im_location WHERE user_id ='+datum.user_id;
                let where   = ' AND (code LIKE "%'+datum.search+'%" OR name LIKE "%'+datum.search+'%" OR name LIKE "%'+datum.description+'%")';                
                let limit   = ' LIMIT '+datum.page+','+datum.limit;


                if(!datum.search && !datum.filter_status){
                    qry += ',('+count+from+') AS "total"';
                    qry += from;
                }

                if(!datum.search && datum.filter_status){
                    qry += ',('+count+from+status+') AS "total"';
                    qry += from+status;
                }

                if(datum.search && datum.filter_status){
                    qry += ',('+count+from+status+where+') AS "total"';
                    qry += from+status+where;
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
                            let locations = [];
                            let i =0;                            
                            for(i=0; i<result.length;i++){
                                let status = true;
                                if(result[i].deleted!=null){
                                    status = false;
                                }
                                locations.push({
                                    id          : result[i].id,
                                    code        : result[i].code,
                                    name        : result[i].name,
                                    description : result[i].description,
                                    created     : result[i].created,
                                    updated     : result[i].updated,
                                    deleted     : result[i].deleted,
                                    user_id     : result[i].user_id,
                                    status      : status
                                });

                                if(i==result.length-1){                                    
                                    resolve({total:total, locations:locations});
                                }
                            }
                            
                        } 
                    }
                ).end();        

        })
    }



    module.retrieve_location = (data) => {
        return new Promise(function(resolve, reject) {
            
            let datum = data[0];
            mysql.use(db)
            .query(
                'SELECT * FROM im_location WHERE user_id=? AND id=?',
                [datum.user_id,datum.id],
                function(err, result) {
                    if (err) {
                        reject(err);
                    }else if(result.length==0){
                        resolve([]);
                    }else{                        
                     
                        let status = true;
                        if(result[0].deleted!=null){
                            status = false;
                        }
                        let location = {
                            id          : result[0].id,
                            code        : result[0].code,
                            name        : result[0].name,
                            description : result[0].description,
                            created     : result[0].created,
                            updated     : result[0].updated,
                            deleted     : result[0].deleted,
                            user_id     : result[0].user_id,
                            status      : status
                        };
                                                      
                        resolve(location);
                            
                        
                    } 
                    
                }
            )
            .end();

        })
    }



    module.change_location_status = (data) => {
        return new Promise(function(resolve, reject) {
            
            let datum = data[0];
            mysql.use(db)
            .query(
                'SELECT * FROM im_location WHERE user_id=? AND id=?',
                [datum.user_id, datum.id],
                function(err, result) {
                    if (err) {
                        reject(err);
                    }else if(result.length==0){
                        resolve([]);
                    }else{                        
                     
                        if(result[0].deleted==null){

                            mysql.use(db)
                            .query(
                                'UPDATE im_location SET deleted = NOW() WHERE id = ?',
                                datum.id,
                                function(err1,result1){
                                    if (err1) {
                                        reject(err1);
                                    }else{

                                        mysql.use(db)
                                        .query(
                                            'SELECT * FROM im_location WHERE user_id=? AND id=?',
                                            [datum.user_id, datum.id],
                                            function(err, result) {
                                                if (err) {
                                                    reject(err);
                                                }else{
                                                    let location = {
                                                        id          : result[0].id,
                                                        code        : result[0].code,
                                                        name        : result[0].name,
                                                        description : result[0].description,
                                                        created     : result[0].created,
                                                        updated     : result[0].updated,
                                                        deleted     : result[0].deleted,
                                                        user_id     : result[0].user_id,
                                                        status      : false,
                                                        message     : "Successfully deactivated location"
                                                    };

                                                    resolve(location);
                                                }
                                            }
                                        ).end()

                                    }
                                }
                            ).end()

                        }else{

                            mysql.use(db)
                            .query(
                                'UPDATE im_location SET deleted = null WHERE id = ?',
                                datum.id,
                                function(err1,result1){
                                    if (err1) {
                                        reject(err1);
                                    }else{

                                        mysql.use(db)
                                        .query(
                                            'SELECT * FROM im_location WHERE user_id=? AND id=?',
                                            [datum.user_id, datum.id],
                                            function(err, result) {
                                                if (err) {
                                                    reject(err);
                                                }else{
                                                    let location = {
                                                        id          : result[0].id,
                                                        code        : result[0].code,
                                                        name        : result[0].name,
                                                        description : result[0].description,
                                                        created     : result[0].created,
                                                        updated     : result[0].updated,
                                                        deleted     : result[0].deleted,
                                                        user_id     : result[0].user_id,
                                                        status      : true,
                                                        message     : "Successfully activated location"
                                                    };
                                                    
                                                
                                                    resolve(location);
                                                }
                                            }
                                        ).end()

                                    }
                                }
                            ).end()

                        }
                            
                        
                    } 
                    
                }
            )
            .end();

        })
    }



    module.update_location = (data) => {
        return new Promise(function(resolve, reject) {
            
            let datum = data[0];

            function start(){                
                mysql.use(db)
                .query(
                    'SELECT id,code FROM im_location WHERE code = ? AND user_id=? AND deleted IS NULL',
                    [datum.code, datum.user_id],
                    send_response
                ).end()                
            }

            function send_response(err, result, args, last_query){
                if (err) {
                    reject(err);
                }

                if (result.length > 1) {             
                    reject({code: "DUP_ENTRY"})
                }else if (result.length == 1){
    
                    if(result[0].id == datum.id){
                        mysql.use(db)
                        .query(
                            'UPDATE im_location SET ? WHERE id = ? AND user_id=?',
                            [datum, datum.id, datum.user_id],
                            function(error, result) {
                                if (error) {
                                    reject(error);
                                }else{                                    
                                    let location = {
                                        message:    'Successfully updated location',
                                        id:          datum.id,
                                        code:        datum.code,
                                        name:        datum.name,
                                        description: datum.description,
                                        user_id:     datum.user_id          
                                    };
                                        
                                    resolve(location)
                                    
                                }
                                                    
                            }
                        )
                        .end();
                    }else{
                        reject({code: "NO_RECORD_UPDATED"})
                    }
                        
                }else{
                    
                    mysql.use(db)
                    .query(
                        'UPDATE im_location SET ? WHERE id = ? AND user_id=?',
                        [datum, datum.id, datum.user_id],
                        function(error, result) {
                            if (error) {
                                reject(error);
                            }else{
                                
                                let location = {
                                    message:    'Successfully updated location',
                                    id:          datum.id,
                                    code:        datum.code,
                                    name:        datum.name,
                                    description: datum.description,
                                    user_id:     datum.user_id          
                                };
                                    
                                resolve(location)
                                
                            }
                                                
                        }
                    )
                    .end();

                }
            }

            start();


        })
    }


    return module;
};




