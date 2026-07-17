import { toInt } from "../utils/numbers.js";

import {
    computerFindById,
    computerList,
    computerSoftwareList,
    computerDriversList,
    computerServicesList,
    computerUpdatesList,

    computerSoftwareDelete,
    computerSoftwareInsert,

    computerDriversDelete,
    computerDriversInsert,

    computerServicesDelete,
    computerServicesInsert,

    computerUpdatesDelete,
    computerUpdatesInsert,

    computerFindByIp

} from "../repositories/computers.repo.js";


// =========================
// Computers
// =========================

export async function listComputers(query) {

    return await computerList(query);

}

export async function getComputerByIp(ip) {

    return await computerFindByIp(ip);

}

export async function getComputer(id) {

    const computer = await computerFindById(id);

    if (!computer) {

        const err = new Error(
            "Racunar nije pronadjen."
        );

        err.status = 404;

        throw err;
    }


    return computer;

}



// =========================
// Software
// =========================

export async function getComputerSoftware(id) {

    return await computerSoftwareList(id);

}


export async function syncComputerSoftware(
    ipEntryId,
    software
) {


    await getComputer(ipEntryId);


    await computerSoftwareDelete(
        ipEntryId
    );


    if (!software.length) {
        return true;
    }


    const rows = software.map(item => ({

        ip_entry_id: ipEntryId,

        display_name:
            item.displayName ?? null,

        display_version:
            item.displayVersion ?? null,

        publisher:
            item.publisher ?? null,

        install_date:
            item.installDate ?? null

    }));


    await computerSoftwareInsert(rows);


    return true;
}



// =========================
// Drivers
// =========================

export async function getComputerDrivers(id) {

    return await computerDriversList(id);

}



export async function syncComputerDrivers(
    ipEntryId,
    drivers
) {


    await getComputer(ipEntryId);


    await computerDriversDelete(
        ipEntryId
    );


    if (!drivers.length) {
        return true;
    }


    const rows = drivers.map(item => ({

        ip_entry_id: ipEntryId,

        device_name:
            item.deviceName ?? null,

        driver_version:
            item.driverVersion ?? null,

        driver_date:
            item.driverDate ?? null,

        manufacturer:
            item.manufacturer ?? null,

        driver_provider_name:
            item.driverProviderName ?? null

    }));


    await computerDriversInsert(rows);


    return true;
}



// =========================
// Services
// =========================

export async function getComputerServices(id) {

    return await computerServicesList(id);

}



export async function syncComputerServices(
    ipEntryId,
    services
) {


    await getComputer(ipEntryId);


    await computerServicesDelete(
        ipEntryId
    );


    if (!services.length) {
        return true;
    }


    const rows = services.map(item => ({

        ip_entry_id: ipEntryId,

        name:
            item.name ?? null,

        display_name:
            item.displayName ?? null,

        state:
            item.state ?? null,

        start_mode:
            item.startMode ?? null,

        start_name:
            item.startName ?? null,

        path_name:
            item.pathName ?? null

    }));


    await computerServicesInsert(rows);


    return true;
}



// =========================
// Updates
// =========================

export async function getComputerUpdates(id) {

    return await computerUpdatesList(id);

}



export async function syncComputerUpdates(
    ipEntryId,
    updates
) {


    await getComputer(ipEntryId);


    await computerUpdatesDelete(
        ipEntryId
    );


    if (!updates.length) {
        return true;
    }


    const rows = updates.map(item => ({

        ip_entry_id: ipEntryId,

        description:
            item.description ?? null,

        hotfix_id:
            item.hotFixID ?? null,

        installed_on:
            item.installedOn ?? null,

        installed_by:
            item.installedBy ?? null

    }));


    await computerUpdatesInsert(rows);


    return true;
}