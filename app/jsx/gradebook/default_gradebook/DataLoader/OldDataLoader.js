/*
 * Copyright (C) 2016 - present Instructure, Inc.
 *
 * This file is part of Canvas.
 *
 * Canvas is free software: you can redistribute it and/or modify it under
 * the terms of the GNU Affero General Public License as published by the Free
 * Software Foundation, version 3 of the License.
 *
 * Canvas is distributed in the hope that it will be useful, but WITHOUT ANY
 * WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR
 * A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
 * details.
 *
 * You should have received a copy of the GNU Affero General Public License along
 * with this program. If not, see <http://www.gnu.org/licenses/>.
 */

import {deferPromise} from '../../../shared/async'
import StudentContentDataLoader from './StudentContentDataLoader'

function getCustomColumns(courseId, dispatch) {
  const url = `/api/v1/courses/${courseId}/custom_gradebook_columns`
  return dispatch.getDepaginated(url, {include_hidden: true})
}

function getDataForColumn(courseId, columnId, options, perPageCallback, dispatch) {
  const url = `/api/v1/courses/${courseId}/custom_gradebook_columns/${columnId}/data`
  const augmentedCallback = data => perPageCallback(columnId, data)
  const params = {include_hidden: true, per_page: options.perPage}
  return dispatch.getDepaginated(url, params, augmentedCallback)
}

function getCustomColumnData(options, customColumnsDfd, dispatch) {
  const {courseId, gradebook} = options
  const perPageCallback = gradebook.gotCustomColumnDataChunk
  const customColumnDataLoaded = deferPromise()

  if (options.customColumnIds) {
    const customColumnDataDfds = options.customColumnIds.map(columnId =>
      getDataForColumn(courseId, columnId, options, perPageCallback, dispatch)
    )
    Promise.all(customColumnDataDfds).then(() => customColumnDataLoaded.resolve())
  } else {
    customColumnsDfd.then(customColumns => {
      const customColumnDataDfds = customColumns.map(column =>
        getDataForColumn(courseId, column.id, options, perPageCallback, dispatch)
      )
      Promise.all(customColumnDataDfds).then(() => customColumnDataLoaded.resolve())
    })
  }

  return customColumnDataLoaded.promise
}

function loadGradebookData(opts) {
  const {dataLoader, dispatch, gradebook} = opts

  const gotAssignmentGroups = opts.getAssignmentGroups
    ? dataLoader.assignmentGroupsLoader.loadAssignmentGroups()
    : null

  // Begin loading Student IDs before any other data.
  const gotStudentIds = dataLoader.studentIdsLoader.loadStudentIds()

  let gotGradingPeriodAssignments
  if (opts.getGradingPeriodAssignments) {
    gotGradingPeriodAssignments = dataLoader.gradingPeriodAssignmentsLoader.loadGradingPeriodAssignments()
  }

  const gotCustomColumns = opts.getCustomColumns ? getCustomColumns(opts.courseId, dispatch) : null

  const studentContentDataLoader = new StudentContentDataLoader(
    {
      courseId: opts.courseId,
      gradebook: opts.gradebook,
      loadedStudentIds: opts.loadedStudentIds,
      studentsChunkSize: opts.perPage,
      submissionsChunkSize: opts.submissionsChunkSize
    },
    dispatch
  )

  const gotContextModules = opts.getContextModules
    ? dataLoader.contextModulesLoader.loadContextModules()
    : null

  const gotStudents = deferPromise()
  const gotSubmissions = deferPromise()

  gotStudentIds
    .then(() => {
      const studentIds = gradebook.courseContent.students.listStudentIds()
      return studentContentDataLoader.load(studentIds)
    })
    .then(() => {
      gotStudents.resolve()
      gotSubmissions.resolve()
    })

  // Custom Column Data will load only after custom columns and all submissions.
  gotSubmissions.promise.then(() => getCustomColumnData(opts, gotCustomColumns, dispatch))

  return {
    gotAssignmentGroups,
    gotContextModules,
    gotCustomColumns,
    gotGradingPeriodAssignments,
    gotStudentIds,
    gotStudents: gotStudents.promise,
    gotSubmissions: gotSubmissions.promise
  }
}

export default {
  getDataForColumn,
  loadGradebookData
}
