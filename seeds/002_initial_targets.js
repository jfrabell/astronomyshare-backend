/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.seed = async function(knex) {
  // Deletes ALL existing entries from the 'targets' table first.
  await knex('targets').del();

  // Inserts seed entries for your baseline targets.
  await knex('targets').insert([
    // --- PASTE YOUR TARGET OBJECTS HERE ---
    // Use the format: { target_name: 'Name', description: 'Description or null' }
    // Make sure strings are quoted. Add a comma after each object except the last one.

    // Example Targets (Replace/Add your actual list):
    { target_name: 'M1', description: 'Crab Nebula' },
    { target_name: 'M8', description: 'Lagoon Nebula' },
    { target_name: 'M13', description: 'Hercules Globular Cluster' },
    { target_name: 'M16', description: 'Eagle Nebula' },
    { target_name: 'M17', description: 'Omega Nebula (Swan Nebula)' },
    { target_name: 'M20', description: 'Trifid Nebula' },
    { target_name: 'M27', description: 'Dumbbell Nebula' },
    { target_name: 'M31', description: 'Andromeda Galaxy' },
    { target_name: 'M33', description: 'Triangulum Galaxy' },
    { target_name: 'M42', description: 'Orion Nebula' },
    { target_name: 'M45', description: 'Pleiades' },
    { target_name: 'M51', description: 'Whirlpool Galaxy' },
    { target_name: 'M57', description: 'Ring Nebula' },
    { target_name: 'M81', description: "Bode's Galaxy" },
    { target_name: 'M82', description: 'Cigar Galaxy' },
    { target_name: 'M101', description: 'Pinwheel Galaxy' }
    // Add any others you want from your list...
    // { target_name: 'NGC 7293', description: 'Helix Nebula' },
    // { target_name: 'No Target Set' }, // If you need a default with null description

  ]);
};