/* eslint-disable @typescript-eslint/no-explicit-any */

export function search(records: any, request: any) {
  // Poor man search.
  if (request.queryParams["filter[search]"]) {
    const fragment = request.queryParams["filter[search]"];
    records = records.filter((record: any) =>
      Object.values(record.attrs).some(
        (value: any) => {
          value && JSON.stringify(value).toLowerCase().includes(fragment.toLowerCase())
        }
      ) 
      // Special case for members and account codes.
      || (record.account?.attrs.code.toLowerCase().includes(fragment.toLowerCase()))
    );
  }
  return records;
}

/**
 * Implements the filtering for a JSON:API request.
 * 
 * @param records 
 * @param request 
 */
export function filter(records: any, request: any) {
  records = search(records, request);
  // Filter by field values
  const regex = /filter\[(.+)\]/;
  Object.entries(request.queryParams)
    .filter(([name, ]) => name != "filter[search]")
    .filter(([name, ]) => name != "filter[expired]")
    .filter(([name, ]) => regex.test(name))
    .map(([name, value]) => ([(name.match(regex) as string[])[1], value]) as [string,string])
    .forEach(([name, value] ) => {
      const values = value.split(",");
      records = records.filter((record: any) => {
        if (record.associations[name]) {
          name = record.associations[name].identifier;
        }
        const recordValue = record[name];
        return Array.isArray(recordValue) 
          ? recordValue.some((v: any) => values.includes(v)) 
          : values.includes(recordValue);
      })
    });
  records = sort(records, request);
  return records;
}

/**
 * Implements the sorting for a JSON:API request.
 */
export function sort(records: any, request: any) {
  let field: string = request.queryParams["sort"];
  if (!field) {
    return records;
  }
  let ascending = true;
  if (field.startsWith("-")) {
    field = field.substring(1);
    ascending = false;
  }
  records = records.sort((a:any, b:any) => {
    let res = 0;
    if (a[field] < b[field]) {
      res = -1
    } else if (a[field] > b[field]) {
      res = 1;
    }
    if (!ascending) res = res * (-1)
    return res;
  })
  return records;
}