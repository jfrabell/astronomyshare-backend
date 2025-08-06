/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> } 
 */
exports.seed = async function(knex) {
  await knex('user').del();
  await knex('user').insert([
    // User 1: jfrabell (Verified) - Will get ID 1 if table is empty
    {
      // id is omitted, will auto-increment
      uname: 'jfrabell',
      // Note: Your data showed 'jfrabella@yahoo.com' - typo? Using as provided.
      email: 'jfrabell@yahoo.com',
      pwrd: '$2b$10$ev3xfz9e7D4ViLwqxl6f6O0AIev1Y9b5gEQUhmjuv7JvZ8/nd3iRu', // Copied hash
      isVerified: 1, // Was verified
      upload_quota: 1073741824, // 1 GiB
      used_quota: 0
      // registration_date will use DB default
      // token fields will use DB default (NULL)
    },
    // User 2: iflywoe (Not Verified) - Will get ID 2
    {
      uname: 'iflywoe',
      email: 'iflywoe@msn.com',
      pwrd: '$2b$10$SiLKx1qgQg2OYa/owvmkBewj2qdqg6bamVfhOiDHXRjsXZPfwBrnK', // Copied hash
      isVerified: 0, // Was NOT verified in data provided
      upload_quota: 1073741824,
      used_quota: 0
    },
    // User 3: dmireles24 (Verified) - Will get ID 3
    {
      uname: 'dmireles24',
      email: 'dmireles24@hotmail.com',
      pwrd: '$2b$10$YdbNfSZm6uZ9zlhlp0QMr.lWgE.u4ZPedXDw.OKz.Yt.S4RPY4DUu', // Copied hash
      isVerified: 1, // Was verified
      upload_quota: 1073741824,
      used_quota: 0
    }
  ]);
};
