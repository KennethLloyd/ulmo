/*2018-11-23*/
ALTER TABLE im_balance_history_details ADD COLUMN expiration_date DATETIME NULL DEFAULT NULL AFTER item_id;