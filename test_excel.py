import requests
import xlrd
import  io
import csv

URL =  "https://zenodo.org/record/3708448/files/SELENE_BAYNUNK_GUJAAHAR.xls?download=1"

if __name__ == "__main__":
    print("go")
    r = requests.get(URL)
    # excel_file = io.StringIO()
    # excel_file.write(r.text)
    # excel_file.seek(0)
    excel_data = xlrd.open_workbook(file_contents=r.content)
    sheet = excel_data.sheet_by_index(0)
    csv_data = io.StringIO("")
    w = csv.writer(csv_data, dialect="unix")
    for i in range(sheet.nrows):
        cells = sheet.row_values(i)
        if any([x.strip != '' for x in cells]):
            w.writerow(cells)
    csv_data.seek(0)
    print("".join(csv_data.readlines()))